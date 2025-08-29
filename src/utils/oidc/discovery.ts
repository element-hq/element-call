/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MatrixClient, MatrixError, OidcClientConfig } from "matrix-js-sdk";

import { Config } from "../../config/Config";
import { HomeserverMisconfigError } from "../../RichError";

export async function getAuthMetadata(): Promise<OidcClientConfig | null> {
  const baseUrl = Config.defaultHomeserverUrl(); // TODO: Make this configurable
  if (!baseUrl) {
    throw new Error("No homeserver URL configured");
  }
  
  const tempClient = new MatrixClient({ baseUrl });
  try {
    return await tempClient.getAuthMetadata();
  } catch (e) {
    if (e instanceof MatrixError && e.httpStatus === 404 && e.errcode === "M_UNRECOGNIZED") {
      // 404 M_UNRECOGNIZED means the server does not support OIDC
      return null;
    } else {
      throw new HomeserverMisconfigError(e instanceof Error ? e.message : undefined);
    }
  }
}