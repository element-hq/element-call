/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState,
  type E2EEManagerOptions,
  ExternalE2EEKeyProvider,
  LocalVideoTrack,
  Room,
  type RoomOptions,
} from "livekit-client";
import { useEffect, useRef } from "react";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { defaultLiveKitOptions } from "./options";
import { type SFUConfig } from "./openIDSFU";
import { type MuteStates } from "../room/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import {
  type ECConnectionState,
  useECConnectionState,
} from "./useECConnectionState";
import { MatrixKeyProvider } from "../e2ee/matrixKeyProvider";
import { E2eeType } from "../e2ee/e2eeType";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import {
  useTrackProcessor,
  useTrackProcessorSync,
} from "./TrackProcessorContext";
import { observeTrackReference$ } from "../state/MediaViewModel";
import { useUrlParams } from "../UrlParams";
import { useInitial } from "../useInitial";
import { getValue } from "../utils/observable";
import { type SelectedDevice } from "../state/MediaDevices";

interface UseLivekitResult {
  livekitPublicationRoom?: Room;
  connState: ECConnectionState;
}

// TODO-MULTI-SFU This is all the logic we need in the subscription connection logic (sync output devices)
// This is not used! (but summarizes what we need)
export function livekitSubscriptionRoom(
  rtcSession: MatrixRTCSession,
  muteStates: MuteStates,
  sfuConfig: SFUConfig | undefined,
  e2eeSystem: EncryptionSystem,
): UseLivekitResult {
  // Only ever create the room once via useInitial.
  // The call can end up with multiple livekit rooms. This is the particular room in
  // which this participant publishes their media.
  const publicationRoom = useInitial(() => {
    logger.info("[LivekitRoom] Create LiveKit room");

    let e2ee: E2EEManagerOptions | undefined;
    if (e2eeSystem.kind === E2eeType.PER_PARTICIPANT) {
      logger.info("Created MatrixKeyProvider (per participant)");
      e2ee = {
        keyProvider: new MatrixKeyProvider(),
        worker: new E2EEWorker(),
      };
    } else if (e2eeSystem.kind === E2eeType.SHARED_KEY && e2eeSystem.secret) {
      logger.info("Created ExternalE2EEKeyProvider (shared key)");
      e2ee = {
        keyProvider: new ExternalE2EEKeyProvider(),
        worker: new E2EEWorker(),
      };
    }

    const roomOptions: RoomOptions = {
      ...defaultLiveKitOptions,
      audioOutput: {
        // When using controlled audio devices, we don't want to set the
        // deviceId here, because it will be set by the native app.
        // (also the id does not need to match a browser device id)
        deviceId: controlledAudioDevices
          ? undefined
          : getValue(devices.audioOutput.selected$)?.id,
      },
      e2ee,
    };
    // We have to create the room manually here due to a bug inside
    // @livekit/components-react. JSON.stringify() is used in deps of a
    // useEffect() with an argument that references itself, if E2EE is enabled
    const room = new Room(roomOptions);
    room.setE2EEEnabled(e2eeSystem.kind !== E2eeType.NONE).catch((e) => {
      logger.error("Failed to set E2EE enabled on room", e);
    });

    return room;
  });

  // Setup and update the keyProvider which was create by `createRoom`
  useEffect(() => {
    const e2eeOptions = publicationRoom.options.e2ee;
    if (
      e2eeSystem.kind === E2eeType.NONE ||
      !(e2eeOptions && "keyProvider" in e2eeOptions)
    )
      return;

    if (e2eeSystem.kind === E2eeType.PER_PARTICIPANT) {
      (e2eeOptions.keyProvider as MatrixKeyProvider).setRTCSession(rtcSession);
    } else if (e2eeSystem.kind === E2eeType.SHARED_KEY && e2eeSystem.secret) {
      (e2eeOptions.keyProvider as ExternalE2EEKeyProvider)
        .setKey(e2eeSystem.secret)
        .catch((e) => {
          logger.error("Failed to set shared key for E2EE", e);
        });
    }
  }, [publicationRoom.options.e2ee, e2eeSystem, rtcSession]);

  return {
    connState: connectionState,
    livekitPublicationRoom: publicationRoom,
  };
}
