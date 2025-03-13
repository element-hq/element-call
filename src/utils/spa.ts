/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ICreateClientOpts, MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { Config } from "../config/Config";
import { fallbackICEServerAllowed, initClient } from "./matrix";
import type { InitResult, Session } from "../ClientContext";

export async function initSPA(
  loadSession: () => Session | undefined,
  clearSession: () => void,
): Promise<InitResult | null> {
  // We're running as a standalone application
  try {
    const session = loadSession();
    if (!session) {
      logger.log("No session stored; continuing without a client");
      return null;
    }

    logger.log("Using a standalone client");

    /* eslint-disable camelcase */
    const { user_id, device_id, access_token, passwordlessUser } = session;
    const initClientParams: ICreateClientOpts = {
      baseUrl: Config.defaultHomeserverUrl()!,
      accessToken: access_token,
      userId: user_id,
      deviceId: device_id,
      fallbackICEServerAllowed,
      livekitServiceURL: Config.get().livekit?.livekit_service_url,
    };

    try {
      const client = await initClient(initClientParams, true);
      return {
        widgetApi: null,
        client,
        passwordlessUser,
      };
    } catch (err) {
      if (err instanceof MatrixError && err.errcode === "M_UNKNOWN_TOKEN") {
        // We can't use this session anymore, so let's log it out
        logger.log(
          "The session from local store is invalid; continuing without a client",
        );
        clearSession();
        // returning null = "no client` pls register" (undefined = "loading" which is the current value when reaching this line)
        return null;
      }
      throw err;
    }
  } catch (err) {
    clearSession();
    throw err;
  }
}
