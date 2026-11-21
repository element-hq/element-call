/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { catchError, from, map, of } from "rxjs";

import { type Behavior, constant } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";

/**
 * A session of Element Call's own, as the standalone app stores it.
 */
export interface StoredSession {
  user_id: string;
  device_id: string;
  access_token: string;
  passwordlessUser: boolean;
}

export type ClientSessionState =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "signedIn"; client: MatrixClient; passwordlessUser: boolean }
  | { state: "error"; error: Error };

/**
 * A newly registered account, with its client started. Registering and signing
 * in are separate steps, as a caller may have more to do with the account
 * before the session changes hands — creating the call it was registered for,
 * say.
 */
export interface Registration {
  client: MatrixClient;
  setSignedIn: () => void;
}

/**
 * Where Element Call's client comes from. Every build has one: a session of
 * Element Call's own, or one a host has supplied.
 */
export interface ClientSession {
  state$: Behavior<ClientSessionState>;
}

/**
 * What can be done with a client created in EC (SPA). Widget and host client
 * wont have this, see useClientManager and useClientManagerIfAny
 */
export interface ClientManager {
  /** Signs in to the homeserver with a password, ending any current session. */
  login: (
    homeserver: string,
    username: string,
    password: string,
  ) => Promise<MatrixClient>;
  /** Registers an account on the default homeserver. */
  register: (
    username: string,
    password: string,
    displayName: string,
    recaptchaResponse: string,
    passwordlessUser: boolean,
  ) => Promise<Registration>;
  logout: () => Promise<void>;
}

/**
 * A client supplied by the host, which owns the user's session: signed in from
 * the start, nothing to restore. Used for the component target.
 */
export function hostClientSession(client: MatrixClient): ClientSession {
  return { state$: constant(signedIn(client)) };
}

/**
 * A client the host is still handing over.
 * Used for the embedded target, widget API.
 */
export function pendingHostClientSession(
  scope: ObservableScope,
  client: Promise<MatrixClient>,
): ClientSession {
  return {
    state$: scope.behavior<ClientSessionState>(
      from(client).pipe(
        map(signedIn),
        catchError((e) => {
          logger.error("Failed to obtain the host's client", e);
          return of<ClientSessionState>({ state: "error", error: e });
        }),
      ),
      { state: "loading" },
    ),
  };
}

function signedIn(client: MatrixClient): ClientSessionState {
  return { state: "signedIn", client, passwordlessUser: false };
}
