/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useState, useEffect, useCallback, useRef } from "react";
import { InteractiveAuth } from "matrix-js-sdk/src/interactive-auth";
import {
  createClient,
  MatrixClient,
  RegisterResponse,
} from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { initClient } from "../matrix-utils";
import { Session } from "../ClientContext";
import { Config } from "../config/Config";
import { widget } from "../widget";

export const useInteractiveRegistration = (): {
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

  const authClient = useRef<MatrixClient>();
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
        requestEmailToken: async (): Promise<{ sid: string }> => {
          return Promise.resolve({ sid: "dummy" });
        },
      });

      // XXX: This claims to return an IAuthData which contains none of these
      // things - the js-sdk types may be wrong?
      /* eslint-disable camelcase,@typescript-eslint/no-explicit-any */
      const { user_id, access_token, device_id } =
        (await interactiveAuth.attemptAuth()) as any;

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
    [],
  );

  return { privacyPolicyUrl, recaptchaKey, register };
};
