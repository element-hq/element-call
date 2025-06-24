/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type IOpenIDToken, type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { useEffect, useRef, useState } from "react";
import { type LivekitFocus } from "matrix-js-sdk/lib/matrixrtc";

import { useActiveLivekitFocus } from "../room/useActiveFocus";
import { useErrorBoundary } from "../useErrorBoundary";
import { FailToGetOpenIdToken } from "../utils/errors";
import { doNetworkOperationWithRetry } from "../utils/matrix";

export interface SFUConfig {
  url: string;
  jwt: string;
}

export function sfuConfigEquals(a?: SFUConfig, b?: SFUConfig): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;

  return a.jwt === b.jwt && a.url === b.url;
}

// The bits we need from MatrixClient
export type OpenIDClientParts = Pick<
  MatrixClient,
  "getOpenIdToken" | "getDeviceId"
>;

export function useOpenIDSFU(
  client: OpenIDClientParts,
  rtcSession: MatrixRTCSession,
): SFUConfig | undefined {
  const [sfuConfig, setSFUConfig] = useState<SFUConfig | undefined>(undefined);

  const activeFocus = useActiveLivekitFocus(rtcSession);

  // TODO: this is an ugly workaround to avoid re-requesting a new jwt token when there is no change in the active focus.
  // We have a problem with the hooks here. The root problem should be fixed.
  const currentFocus = useRef(Object.assign({}, activeFocus));

  const { showErrorBoundary } = useErrorBoundary();

  useEffect(() => {
    if (activeFocus && !liveKitFocusEquals(activeFocus, currentFocus.current)) {
      getSFUConfigWithOpenID(client, activeFocus).then(
        (sfuConfig) => {
          currentFocus.current = Object.assign({}, activeFocus);
          setSFUConfig(sfuConfig);
        },
        (e) => {
          showErrorBoundary(new FailToGetOpenIdToken(e));
          logger.error("Failed to get SFU config", e);
        },
      );
    } else {
      currentFocus.current = {} as LivekitFocus;
      setSFUConfig(undefined);
    }
  }, [client, activeFocus, showErrorBoundary]);

  return sfuConfig;
}

export function liveKitFocusEquals(
  a?: LivekitFocus,
  b?: LivekitFocus,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;

  return (
    a.type === b.type &&
    a.livekit_service_url === b.livekit_service_url &&
    a.livekit_alias === b.livekit_alias
  );
}

export async function getSFUConfigWithOpenID(
  client: OpenIDClientParts,
  activeFocus: LivekitFocus,
): Promise<SFUConfig | undefined> {
  let openIdToken: IOpenIDToken;
  try {
    openIdToken = await doNetworkOperationWithRetry(async () =>
      client.getOpenIdToken(),
    );
  } catch (error) {
    throw new FailToGetOpenIdToken(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  }
  logger.debug("Got openID token", openIdToken);

  try {
    logger.info(
      `Trying to get JWT from call's active focus URL of ${activeFocus.livekit_service_url}...`,
    );
    const sfuConfig = await getLiveKitJWT(
      client,
      activeFocus.livekit_service_url,
      activeFocus.livekit_alias,
      openIdToken,
    );
    logger.info(`Got JWT from call's active focus URL.`);

    return sfuConfig;
  } catch (e) {
    logger.warn(
      `Failed to get JWT from RTC session's active focus URL of ${activeFocus.livekit_service_url}.`,
      e,
    );
    return undefined;
  }
}

async function getLiveKitJWT(
  client: OpenIDClientParts,
  livekitServiceURL: string,
  roomName: string,
  openIDToken: IOpenIDToken,
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
