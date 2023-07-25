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

import { GroupCall, IOpenIDToken, MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/src/logger";

import { Config } from "../config/Config";

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
  groupCall: GroupCall,
  roomName: string
): Promise<SFUConfig> {
  const openIdToken = await client.getOpenIdToken();
  logger.debug("Got openID token", openIdToken);

  // if the call has a livekit service URL, try it.
  if (groupCall.livekitServiceURL) {
    try {
      logger.info(
        `Trying to get JWT from call's configured URL of ${groupCall.livekitServiceURL}...`
      );
      const sfuConfig = await getLiveKitJWT(
        client,
        groupCall.livekitServiceURL,
        roomName,
        openIdToken
      );
      logger.info(`Got JWT from call state event URL.`);

      return sfuConfig;
    } catch (e) {
      logger.warn(
        `Failed to get JWT from group call's configured URL of ${groupCall.livekitServiceURL}.`,
        e
      );
    }
  }

  // otherwise, try our configured one and, if it works, update the call's service URL in the state event
  // NB. This wuill update it for everyone so we may end up with multiple clients updating this when they
  // join at similar times, but we don't have a huge number of options here.
  const urlFromConf = Config.get().livekit!.livekit_service_url;
  logger.info(`Trying livekit service URL from our config: ${urlFromConf}...`);
  try {
    const sfuConfig = await getLiveKitJWT(
      client,
      urlFromConf,
      roomName,
      openIdToken
    );

    logger.info(
      `Got JWT, updating call livekit service URL with: ${urlFromConf}...`
    );
    try {
      await groupCall.updateLivekitServiceURL(urlFromConf);
      logger.info(`Call livekit service URL updated.`);
    } catch (e) {
      logger.warn(
        `Failed to update call livekit service URL: continuing anyway.`
      );
    }

    return sfuConfig;
  } catch (e) {
    logger.error("Failed to get JWT from URL defined in Config.", e);
    throw e;
  }
}

async function getLiveKitJWT(
  client: OpenIDClientParts,
  livekitServiceURL: string,
  roomName: string,
  openIDToken: IOpenIDToken
): Promise<SFUConfig> {
  try {
    const res = await fetch(livekitServiceURL + "/sfu/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room: roomName,
        openid_token: openIDToken,
        device_id: client.getDeviceId(),
      }),
    });
    if (!res.ok) {
      throw new Error("SFU Config fetch failed with status code " + res.status);
    }
    return await res.json();
  } catch (e) {
    throw new Error("SFU Config fetch failed with exception " + e);
  }
}
