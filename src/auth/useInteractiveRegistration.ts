/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState, useEffect, useCallback, useRef } from "react";
import { InteractiveAuth } from "matrix-js-sdk";
import {
  createClient,
  type MatrixClient,
  type RegisterResponse,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { initClient } from "../utils/matrix";
import { type Session } from "../ClientContext";
import { Config } from "../config/Config";
import { widget } from "../widget";

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
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState<string | undefined>(
    undefined,
  );
  const [recaptchaKey, setRecaptchaKey] = useState<string | undefined>(
    undefined,
  );

  const authClient = useRef<MatrixClient | undefined>(undefined);
  if (!authClient.current) {
    authClient.current = createClient({
      baseUrl: Config.defaultHomeserverUrl()!,
    });
  }

  useEffect(() => {
    if (widget) return;
    // An empty registerRequest is used to get the privacy policy and recaptcha key.
    authClient.current!.registerRequest({}).catch((error) => {
      setPrivacyPolicyUrl(
        error.data?.params["m.login.terms"]?.policies?.privacy_policy?.en?.url,
      );
      setRecaptchaKey(error.data?.params["m.login.recaptcha"]?.public_key);
    });
  }, []);

  const register = useCallback(
    async (
      username: string,
      password: string,
      displayName: string,
      recaptchaResponse: string,
      passwordlessUser: boolean,
    ): Promise<[MatrixClient, Session]> => {
      const interactiveAuth = new InteractiveAuth({
        matrixClient: authClient.current!,
        doRequest: async (auth): Promise<RegisterResponse> =>
          authClient.current!.registerRequest({
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

      // XXX: This claims to return an IAuthData which contains none of these
      // things - the js-sdk types may be wrong?
      /* eslint-disable camelcase,@typescript-eslint/no-explicit-any */
      const { user_id, access_token, device_id } =
        (await interactiveAuth.attemptAuth()) as any;
      await oldClient?.logout(true);
      const client = await initClient(
        {
          baseUrl: Config.defaultHomeserverUrl()!,
          accessToken: access_token,
          userId: user_id,
          deviceId: device_id,
        },
        false,
      );

      await client.setDisplayName(displayName);

      const session: Session = {
        user_id,
        device_id,
        access_token,
        passwordlessUser,
      };
      /* eslint-enable camelcase */

      if (passwordlessUser) {
        session.tempPassword = password;
      }

      const user = client.getUser(client.getUserId()!)!;
      user.setRawDisplayName(displayName);
      user.setDisplayName(displayName);

      return [client, session];
    },
    [oldClient],
  );

  return { privacyPolicyUrl, recaptchaKey, register };
};
