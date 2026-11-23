/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";

import {
  PosthogAnalytics,
  RegistrationType,
} from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";
import { OpenElsewhereError } from "../RichError";
import {
  loginWithPassword,
  registerWithPassword,
} from "../auth/interactiveAuth";
import { initClient } from "../utils/initClient";
import { fallbackICEServerAllowed } from "../utils/matrix";
import {
  type ClientManager,
  type ClientSession,
  type ClientSessionState,
  type Registration,
  type StoredSession,
} from "./ClientSession";
import { type ObservableScope } from "./ObservableScope";

const SESSION_KEY = "matrix-auth-store";

/**
 * A client session for the SPA: restored from storage on creation, and
 * signed in to, out of, or re-authenticated by the login, registration and
 * account flows.
 *
 * To make sure we do not load/bundle the client store worker it is important
 * that this is a separate file: only this module reaches `utils/initClient`,
 * and therefore the client store worker, so it may only be imported by the
 * standalone app's entry point.
 */
export function createStandaloneClientSession$(
  scope: ObservableScope,
): ClientSession & ClientManager {
  const state$ = new BehaviorSubject<ClientSessionState>({ state: "loading" });
  const client = (): MatrixClient | undefined => {
    const { value } = state$;
    return value.state === "signedIn" ? value.client : undefined;
  };

  // To protect against multiple sessions writing to the same storage
  // simultaneously, we send a broadcast message that shuts down all other
  // running instances of the app.
  const loadChannel =
    "BroadcastChannel" in window ? new BroadcastChannel("load") : null;
  loadChannel?.postMessage({});
  const onOpenedElsewhere = (): void => {
    client()?.stopClient();
    state$.next({ state: "error", error: new OpenElsewhereError() });
  };
  loadChannel?.addEventListener("message", onOpenedElsewhere);
  scope.onEnd(() =>
    loadChannel?.removeEventListener("message", onOpenedElsewhere),
  );

  restore().catch((e) => {
    logger.error("Failed to restore the session", e);
    state$.next({ state: "error", error: e });
  });

  return {
    state$: scope.behavior(state$),
    login: async (homeserver, username, password): Promise<MatrixClient> => {
      const session: StoredSession = {
        ...(await loginWithPassword(homeserver, username, password)),
        passwordlessUser: false,
      };
      const client = await createClient(homeserver, session);
      signIn(client, session);
      return client;
    },
    register: async (
      username,
      password,
      displayName,
      recaptchaResponse,
      passwordlessUser,
    ): Promise<Registration> => {
      const homeserver = Config.defaultHomeserverUrl()!;
      const session: StoredSession = {
        ...(await registerWithPassword(
          homeserver,
          username,
          password,
          recaptchaResponse,
        )),
        passwordlessUser,
      };
      const client = await createClient(homeserver, session);

      await client.setDisplayName(displayName);
      const user = client.getUser(client.getUserId()!)!;
      user.setRawDisplayName(displayName);
      user.setDisplayName(displayName);

      return { client, setSignedIn: (): void => signIn(client, session) };
    },
    logout: async (): Promise<void> => {
      const current = client();
      if (!current) return;

      await current.logout(true);
      await current.clearStores();
      clearSession();
      state$.next({ state: "signedOut" });
      PosthogAnalytics.instance.logout();
      PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
    },
  };

  async function restore(): Promise<void> {
    // The homeserver to restore against is in the config, which is loaded
    // concurrently with this
    await Config.init();
    try {
      const session = loadSession();
      if (session === undefined) {
        logger.log("No session stored; continuing without a client");
        state$.next({ state: "signedOut" });
        return;
      }

      logger.log("Using a standalone client");
      const client = await initClient(
        {
          baseUrl: Config.defaultHomeserverUrl()!,
          accessToken: session.access_token,
          userId: session.user_id,
          deviceId: session.device_id,
          fallbackICEServerAllowed,
          livekitServiceURL: Config.get().livekit?.livekit_service_url,
        },
        true,
      );
      state$.next({
        state: "signedIn",
        client,
        passwordlessUser: session.passwordlessUser,
      });
    } catch (e) {
      // Whatever went wrong, the stored session is not to be tried again
      clearSession();
      if (e instanceof MatrixError && e.errcode === "M_UNKNOWN_TOKEN") {
        logger.log(
          "The session from local store is invalid; continuing without a client",
        );
        state$.next({ state: "signedOut" });
        return;
      }
      throw e;
    }
  }

  /**
   * Starts a client for a new session, ending the current one first.
   */
  async function createClient(
    homeserver: string,
    session: StoredSession,
  ): Promise<MatrixClient> {
    // To not confuse the rust crypto sessions we need to log out the old
    // client before initializing the new one
    await client()?.logout(true);
    return initClient(
      {
        baseUrl: homeserver,
        accessToken: session.access_token,
        userId: session.user_id,
        deviceId: session.device_id,
      },
      false,
    );
  }

  function signIn(client: MatrixClient, session: StoredSession): void {
    saveSession(session);
    state$.next({
      state: "signedIn",
      client,
      passwordlessUser: session.passwordlessUser,
    });
  }
}

function loadSession(): StoredSession | undefined {
  const data = localStorage.getItem(SESSION_KEY);
  return data ? JSON.parse(data) : undefined;
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
