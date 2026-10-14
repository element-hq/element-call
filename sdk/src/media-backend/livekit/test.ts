/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** LiveKit test doubles shared by the backend's unit tests. Not part of the package. */

import {
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";

import { mockEmitter } from "../../utils/test";

export const exampleServiceUrl = "https://lk.example.org";

export const exampleTransport: UnstableLivekitTransport = {
  type: "livekit",
  livekit_service_url: exampleServiceUrl,
};

export function mockRemoteParticipant(
  participant: Partial<RemoteParticipant>,
): RemoteParticipant {
  return {
    isLocal: false,
    setVolume() {},
    getTrackPublication: () =>
      ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    // this will only get used for `getTrackPublications().length`
    getTrackPublications: () => [0],
    ...mockEmitter(),
    ...participant,
  } as RemoteParticipant;
}
