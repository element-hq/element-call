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

import { useCallback } from "react";
import { InteractiveAuth } from "matrix-js-sdk/src/interactive-auth";
import { createClient, MatrixClient } from "matrix-js-sdk/src/matrix";

import { initClient, defaultHomeserver } from "../matrix-utils";
import { Session } from "../ClientContext";

export const useInteractiveLogin = () =>
  useCallback<
    (
      homeserver: string,
      username: string,
      password: string
    ) => Promise<[MatrixClient, Session]>
  >(async (homeserver: string, username: string, password: string) => {
    const authClient = createClient({ baseUrl: homeserver });

    const interactiveAuth = new InteractiveAuth({
      matrixClient: authClient,
      doRequest: () =>
        authClient.login("m.login.password", {
          identifier: {
            type: "m.id.user",
            user: username,
          },
          password,
        }),
      stateUpdated: null,
      requestEmailToken: null,
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

    const client = await initClient(
      {
        baseUrl: defaultHomeserver,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      },
      false
    );
    /* eslint-enable camelcase */

    return [client, session];
  }, []);
