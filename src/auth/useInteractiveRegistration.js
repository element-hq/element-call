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

import matrix, { InteractiveAuth } from "matrix-js-sdk/src/browser-index";
import { useState, useEffect, useCallback, useRef } from "react";
import { initClient, defaultHomeserver } from "../matrix-utils";

export function useInteractiveRegistration() {
  const [state, setState] = useState({ privacyPolicyUrl: "#", loading: false });

  const authClientRef = useRef();

  useEffect(() => {
    authClientRef.current = matrix.createClient(defaultHomeserver);

    authClientRef.current.registerRequest({}).catch((error) => {
      const privacyPolicyUrl =
        error.data?.params["m.login.terms"]?.policies?.privacy_policy?.en?.url;

      const recaptchaKey = error.data?.params["m.login.recaptcha"]?.public_key;

      if (privacyPolicyUrl || recaptchaKey) {
        setState((prev) => ({ ...prev, privacyPolicyUrl, recaptchaKey }));
      }
    });
  }, []);

  const register = useCallback(
    async (
      username,
      password,
      displayName,
      recaptchaResponse,
      passwordlessUser
    ) => {
      const interactiveAuth = new InteractiveAuth({
        matrixClient: authClientRef.current,
        busyChanged(loading) {
          setState((prev) => ({ ...prev, loading }));
        },
        async doRequest(auth, _background) {
          return authClientRef.current.registerRequest({
            username,
            password,
            auth: auth || undefined,
          });
        },
        stateUpdated(nextStage, status) {
          if (status.error) {
            throw new Error(error);
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

      const { user_id, access_token, device_id } =
        await interactiveAuth.attemptAuth();

      const client = await initClient({
        baseUrl: defaultHomeserver,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      await client.setDisplayName(displayName);

      const session = { user_id, device_id, access_token, passwordlessUser };

      if (passwordlessUser) {
        session.tempPassword = password;
      }

      const user = client.getUser(client.getUserId());

      user.setRawDisplayName(displayName);
      user.setDisplayName(displayName);

      return [client, session];
    },
    []
  );

  return [state, register];
}
