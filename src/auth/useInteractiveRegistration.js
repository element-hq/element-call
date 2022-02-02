import matrix, { InteractiveAuth } from "matrix-js-sdk/src/browser-index";
import { useState, useEffect, useCallback, useRef } from "react";
import { useClient } from "../ClientContext";
import { initClient, defaultHomeserver } from "../matrix-utils";

export function useInteractiveRegistration() {
  const { setClient } = useClient();
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
    async (username, password, recaptchaResponse, passwordlessUser) => {
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

      await client.setDisplayName(username);

      const session = { user_id, device_id, access_token, passwordlessUser };

      if (passwordlessUser) {
        session.tempPassword = password;
      }

      setClient(client, session);

      return client;
    },
    []
  );

  return [state, register];
}
