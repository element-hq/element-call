/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { type MatrixClient } from "matrix-js-sdk";

import { initClient } from "../utils/initClient";
import { type Session } from "../ClientContext";
import { loginWithPassword } from "./interactiveAuth";

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
      const session: Session = {
        ...(await loginWithPassword(homeserver, username, password)),
        passwordlessUser: false,
      };

      // To not confuse the rust crypto sessions we need to logout the old client before initializing the new one.
      await oldClient?.logout(true);
      const client = await initClient(
        {
          baseUrl: homeserver,
          accessToken: session.access_token,
          userId: session.user_id,
          deviceId: session.device_id,
        },
        false,
      );
      return [client, session];
    },
    [oldClient],
  );
}
