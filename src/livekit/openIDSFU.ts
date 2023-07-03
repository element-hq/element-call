/*
Copyright 2023 New Vector Ltd

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

import { MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/src/logger";

export interface SFUConfig {
  url: string;
  jwt: string;
}

// The bits we need from MatrixClient
export type OpenIDClientParts = Pick<
  MatrixClient,
  "getOpenIdToken" | "getDeviceId"
>;

export async function getSFUConfigWithOpenID(
  client: OpenIDClientParts,
  livekitServiceURL: string,
  roomName: string
): Promise<SFUConfig> {
  const openIdToken = await client.getOpenIdToken();
  logger.debug("Got openID token", openIdToken);

  const res = await fetch(livekitServiceURL + "/sfu/get", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room: roomName,
      openid_token: openIdToken,
      device_id: client.getDeviceId(),
    }),
  });
  if (!res.ok) {
    throw new Error("SFO Config fetch failed with status code " + res.status);
  }
  const sfuConfig = await res.json();

  return sfuConfig;
}
