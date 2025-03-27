/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { InteractiveAuth } from "matrix-js-sdk";
import {
  createClient,
  type LoginResponse,
  type MatrixClient,
} from "matrix-js-sdk";

import { initClient } from "../utils/matrix";
import { type Session } from "../ClientContext";
/**
 * This provides the login method to login using user credentials.
 * @param oldClient If there is an already authenticated client it should be passed to this hook
 * this allows the interactive login to sign out the client before logging in.
 * @returns A async method that can be called/awaited to log in with the provided credentials.
 */
export function useInteractiveLogin(
  oldClient?: MatrixClient,
): (
  homeserver: string,
  username: string,
  password: string,
) => Promise<[MatrixClient, Session]> {
  return useCallback<
    (
      homeserver: string,
      username: string,
      password: string,
    ) => Promise<[MatrixClient, Session]>
  >(
    async (homeserver: string, username: string, password: string) => {
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

      // XXX: This claims to return an IAuthData which contains none of these
      // things - the js-sdk types may be wrong?
      /* eslint-disable camelcase,@typescript-eslint/no-explicit-any */
      const { user_id, access_token, device_id } =
        (await interactiveAuth.attemptAuth()) as any;
      const session = {
        user_id,
        access_token,
        device_id,
        passwordlessUser: false,
      };

      // To not confuse the rust crypto sessions we need to logout the old client before initializing the new one.
      await oldClient?.logout(true);
      const client = await initClient(
        {
          baseUrl: homeserver,
          accessToken: access_token,
          userId: user_id,
          deviceId: device_id,
        },
        false,
      );
      /* eslint-enable camelcase */
      return [client, session];
    },
    [oldClient],
  );
}
