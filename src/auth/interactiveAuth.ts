/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createClient,
  InteractiveAuth,
  type LoginResponse,
  type RegisterResponse,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Session } from "../ClientContext";

/** What the homeserver hands out for a new session. */
export type Credentials = Pick<
  Session,
  "user_id" | "device_id" | "access_token"
>;

/**
 * Logs in to the given homeserver with a password.
 */
export async function loginWithPassword(
  homeserver: string,
  username: string,
  password: string,
): Promise<Credentials> {
  const authClient = createClient({ baseUrl: homeserver });
  const interactiveAuth = new InteractiveAuth({
    matrixClient: authClient,
    doRequest: async (): Promise<LoginResponse> =>
      authClient.login("m.login.password", {
        identifier: {
          type: "m.id.user",
          user: username,
        },
        password,
      }),
    stateUpdated: (): void => {},
    requestEmailToken: async (): Promise<{ sid: string }> =>
      Promise.resolve({ sid: "" }),
  });
  return credentials(await interactiveAuth.attemptAuth());
}

/**
 * Registers an account on the given homeserver, accepting its terms and
 * answering its recaptcha challenge.
 */
export async function registerWithPassword(
  homeserver: string,
  username: string,
  password: string,
  recaptchaResponse: string,
): Promise<Credentials> {
  const authClient = createClient({ baseUrl: homeserver });
  const interactiveAuth = new InteractiveAuth({
    matrixClient: authClient,
    doRequest: async (auth): Promise<RegisterResponse> =>
      authClient.registerRequest({
        username,
        password,
        auth: auth || undefined,
      }),
    stateUpdated: (nextStage, status): void => {
      if (status.error) {
        throw new Error(status.error);
      }

      if (nextStage === "m.login.terms") {
        interactiveAuth
          .submitAuthDict({
            type: "m.login.terms",
          })
          .catch((e) => {
            logger.error(e);
          });
      } else if (nextStage === "m.login.recaptcha") {
        interactiveAuth
          .submitAuthDict({
            type: "m.login.recaptcha",
            response: recaptchaResponse,
          })
          .catch((e) => {
            logger.error(e);
          });
      }
    },
    requestEmailToken: async (): Promise<{ sid: string }> =>
      Promise.resolve({ sid: "dummy" }),
  });
  return credentials(await interactiveAuth.attemptAuth());
}

// XXX: attemptAuth claims to return an IAuthData which contains none of these
// things - the js-sdk types may be wrong?
function credentials(authData: unknown): Credentials {
  /* eslint-disable camelcase */
  const { user_id, access_token, device_id } = authData as Credentials;
  return { user_id, access_token, device_id };
  /* eslint-enable camelcase */
}
