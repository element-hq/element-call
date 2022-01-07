import matrix, { InteractiveAuth } from "matrix-js-sdk/src/browser-index";
import { useState, useCallback } from "react";
import { useClient } from "../ClientContext";
import { initClient, defaultHomeserver } from "../matrix-utils";

export function useInteractiveLogin() {
  const { setClient } = useClient();
  const [state, setState] = useState({ loading: false });

  const auth = useCallback(async (homeserver, username, password) => {
    const authClient = matrix.createClient(homeserver);

    const interactiveAuth = new InteractiveAuth({
      matrixClient: authClient,
      busyChanged(loading) {
        setState((prev) => ({ ...prev, loading }));
      },
      async doRequest(_auth, _background) {
        return authClient.login("m.login.password", {
          identifier: {
            type: "m.id.user",
            user: username,
          },
          password,
        });
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

    setClient(client, { user_id, access_token, device_id });

    return client;
  }, []);

  return [state, auth];
}
