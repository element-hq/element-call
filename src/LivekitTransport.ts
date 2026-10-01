/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Transport } from "matrix-js-sdk/lib/matrixrtc";

// TODO: Delete this module and return to using LivekitTransport from
// matrix-js-sdk. This should only exist for a short time to facilitate merging
// some breaking changes to LivekitTransport in matrix-js-sdk.

export interface LivekitTransport extends Transport {
  type: "livekit";
  livekit_service_url: string;
}

export const isLivekitTransport = (object: any): object is LivekitTransport =>
  object.type === "livekit" && "livekit_service_url" in object;
