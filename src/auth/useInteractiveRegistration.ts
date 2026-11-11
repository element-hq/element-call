/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { type MatrixClient } from "matrix-js-sdk";

import { initClient } from "../utils/initClient";
import { type Session } from "../ClientContext";
import { Config } from "../config/Config";
import { registerWithPassword } from "./interactiveAuth";
import { useRegistrationTerms } from "./useRegistrationTerms";

export const useInteractiveRegistration = (
  oldClient?: MatrixClient,
): {
  privacyPolicyUrl?: string;
  recaptchaKey?: string;
  register: (
    username: string,
    password: string,
    displayName: string,
    recaptchaResponse: string,
    passwordlessUser: boolean,
  ) => Promise<[MatrixClient, Session]>;
} => {
  const { privacyPolicyUrl, recaptchaKey } = useRegistrationTerms();

  const register = useCallback(
    async (
      username: string,
      password: string,
      displayName: string,
      recaptchaResponse: string,
      passwordlessUser: boolean,
    ): Promise<[MatrixClient, Session]> => {
      const homeserver = Config.defaultHomeserverUrl()!;
      const session: Session = {
        ...(await registerWithPassword(
          homeserver,
          username,
          password,
          recaptchaResponse,
        )),
        passwordlessUser,
        ...(passwordlessUser ? { tempPassword: password } : {}),
      };

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

      await client.setDisplayName(displayName);
      const user = client.getUser(client.getUserId()!)!;
      user.setRawDisplayName(displayName);
      user.setDisplayName(displayName);

      return [client, session];
    },
    [oldClient],
  );

  return { privacyPolicyUrl, recaptchaKey, register };
};
