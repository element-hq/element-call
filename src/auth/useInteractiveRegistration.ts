/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useState, useEffect, useCallback, useMemo } from "react";
import matrix, { InteractiveAuth } from "matrix-js-sdk/src/browser-index";
import { MatrixClient } from "matrix-js-sdk/src/client";

import { initClient, defaultHomeserver } from "../matrix-utils";
import { Session } from "../ClientContext";

export const useInteractiveRegistration = (): [
  string,
  string,
  (
    username: string,
    password: string,
    displayName: string,
    recaptchaResponse: string,
    passwordlessUser?: boolean
  ) => Promise<[MatrixClient, Session]>
] => {
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState<string>();
  const [recaptchaKey, setRecaptchaKey] = useState<string>();

  const authClient = useMemo(() => matrix.createClient(defaultHomeserver), []);

  useEffect(() => {
    authClient.registerRequest({}).catch((error) => {
      setPrivacyPolicyUrl(
        error.data?.params["m.login.terms"]?.policies?.privacy_policy?.en?.url
      );
      setRecaptchaKey(error.data?.params["m.login.recaptcha"]?.public_key);
    });
  }, [authClient]);

  const register = useCallback(
    async (
      username: string,
      password: string,
      displayName: string,
      recaptchaResponse: string,
      passwordlessUser?: boolean
    ): Promise<[MatrixClient, Session]> => {
      const interactiveAuth = new InteractiveAuth({
        matrixClient: authClient,
        doRequest: (auth) =>
          authClient.registerRequest({
            username,
            password,
            auth: auth || undefined,
          }),
        stateUpdated: (nextStage, status) => {
          if (status.error) {
            throw new Error(status.error);
          }

          if (nextStage === "m.login.terms") {
            interactiveAuth.submitAuthDict({
              type: "m.login.terms",
            });
          } else if (nextStage === "m.login.recaptcha") {
            interactiveAuth.submitAuthDict({
              type: "m.login.recaptcha",
              response: recaptchaResponse,
            });
          }
        },
      });

      /* eslint-disable camelcase */
      const { user_id, access_token, device_id } =
        await interactiveAuth.attemptAuth();

      const client = await initClient({
        baseUrl: defaultHomeserver,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

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

      const user = client.getUser(client.getUserId());
      user.setRawDisplayName(displayName);
      user.setDisplayName(displayName);

      return [client, session];
    },
    [authClient]
  );

  return [privacyPolicyUrl, recaptchaKey, register];
};
