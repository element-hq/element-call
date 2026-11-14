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
import { type Behavior } from "./Behavior";
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
 * A client session for the SPA: restored from storage on construction, and
 * signed in to, out of, or re-authenticated by the login, registration and
 * account flows.
 *
 * This class is responsible for restoring from store and logout and change Pwd.
 *
 * To make sure we do not load/bundle the client store worker it is important
 * that this is a separate file: only this module reaches `utils/initClient`,
 * and therefore the client store worker, so it may only be imported by the
 * standalone app's entry point.
 */
export class StandaloneClientSession implements ClientSession, ClientManager {
  private readonly state = new BehaviorSubject<ClientSessionState>({
    state: "loading",
  });
  public readonly state$: Behavior<ClientSessionState> = this.scope.behavior(
    this.state,
  );

  // To protect against multiple sessions writing to the same storage
  // simultaneously, we send a broadcast message that shuts down all other
  // running instances of the app.
  private readonly loadChannel =
    "BroadcastChannel" in window ? new BroadcastChannel("load") : null;

  public constructor(private readonly scope: ObservableScope) {
    this.loadChannel?.postMessage({});
    const onOpenedElsewhere = (): void => {
      this.client?.stopClient();
      this.state.next({ state: "error", error: new OpenElsewhereError() });
    };
    this.loadChannel?.addEventListener("message", onOpenedElsewhere);
    scope.onEnd(() =>
      this.loadChannel?.removeEventListener("message", onOpenedElsewhere),
    );

    this.restore().catch((e) => {
      logger.error("Failed to restore the session", e);
      this.state.next({ state: "error", error: e });
    });
  }

  private get client(): MatrixClient | undefined {
    const { value } = this.state;
    return value.state === "signedIn" ? value.client : undefined;
  }

  private async restore(): Promise<void> {
    // The homeserver to restore against is in the config, which is loaded
    // concurrently with this
    await Config.init();
    try {
      const session = loadSession();
      if (session === undefined) {
        logger.log("No session stored; continuing without a client");
        this.state.next({ state: "signedOut" });
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
      this.state.next({
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
        this.state.next({ state: "signedOut" });
        return;
      }
      throw e;
    }
  }

  public readonly login = async (
    homeserver: string,
    username: string,
    password: string,
  ): Promise<MatrixClient> => {
    const session: StoredSession = {
      ...(await loginWithPassword(homeserver, username, password)),
      passwordlessUser: false,
    };
    const client = await this.createClient(homeserver, session);
    this.signIn(client, session);
    return client;
  };

  public readonly register = async (
    username: string,
    password: string,
    displayName: string,
    recaptchaResponse: string,
    passwordlessUser: boolean,
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
    const client = await this.createClient(homeserver, session);

    await client.setDisplayName(displayName);
    const user = client.getUser(client.getUserId()!)!;
    user.setRawDisplayName(displayName);
    user.setDisplayName(displayName);

    return { client, setSignedIn: (): void => this.signIn(client, session) };
  };

  /**
   * Starts a client for a new session, ending the current one first.
   */
  private async createClient(
    homeserver: string,
    session: StoredSession,
  ): Promise<MatrixClient> {
    // To not confuse the rust crypto sessions we need to log out the old
    // client before initializing the new one
    await this.client?.logout(true);
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

  private signIn(client: MatrixClient, session: StoredSession): void {
    saveSession(session);
    this.state.next({
      state: "signedIn",
      client,
      passwordlessUser: session.passwordlessUser,
    });
  }

  public readonly logout = async (): Promise<void> => {
    const client = this.client;
    if (!client) return;

    await client.logout(true);
    await client.clearStores();
    clearSession();
    this.state.next({ state: "signedOut" });
    PosthogAnalytics.instance.logout();
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
  };
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
