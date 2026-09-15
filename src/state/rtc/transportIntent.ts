/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { FfiTransportIntent } from "../../matrix-rtc-sdk";

export const LIVEKIT_TRANSPORT_TYPE = "livekit";

/**
 * Publish on LiveKit. With a `serviceUrl` (a developer's custom URL) that
 * transport is used as given; without one the crate discovers it through the
 * driver's `getRtcTransports`, which is where the homeserver's answer and
 * Element Call's config fallback come in.
 */
export function publishOnLivekit(serviceUrl?: string): FfiTransportIntent {
  return new FfiTransportIntent.Publish({
    transport: {
      transportType: LIVEKIT_TRANSPORT_TYPE,
      propertiesJson: JSON.stringify(
        serviceUrl === undefined ? {} : { livekit_service_url: serviceUrl },
      ),
    },
  });
}

/** Take part without publishing media: recorders, observers, tests. */
export function receiveOnly(): FfiTransportIntent {
  return new FfiTransportIntent.ReceiveOnly({
    canSubscribe: [LIVEKIT_TRANSPORT_TYPE],
  });
}
