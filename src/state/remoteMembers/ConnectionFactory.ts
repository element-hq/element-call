/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import {
  type E2EEOptions,
  Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type ObservableScope } from "../ObservableScope.ts";
import { Connection } from "./Connection.ts";
import type { OpenIDClientParts } from "../../livekit/openIDSFU.ts";
import type { MediaDevices } from "../MediaDevices.ts";
import type { Behavior } from "../Behavior.ts";
import type { ProcessorState } from "../../livekit/TrackProcessorContext.tsx";
import { defaultLiveKitOptions } from "../../livekit/options.ts";

export interface ConnectionFactory {
  createConnection(
    transport: LivekitTransport,
    scope: ObservableScope,
    logger: Logger,
  ): Connection;
}

export class ECConnectionFactory implements ConnectionFactory {
  private readonly livekitRoomFactory: () => LivekitRoom;

  /**
   * Creates a ConnectionFactory for LiveKit connections.
   *
   * @param client - The OpenID client parts for authentication, needed to get openID and JWT tokens.
   * @param devices - Used for video/audio out/in capture options.
   * @param processorState$ - Effects like background blur (only for publishing connection?)
   * @param e2eeLivekitOptions - The E2EE options to use for the LiveKit Room.
   * @param controlledAudioDevices - Option to indicate whether audio output device is controlled externally (native mobile app).
   * @param livekitRoomFactory - Optional factory function (for testing) to create LivekitRoom instances. If not provided, a default factory is used.
   */
  public constructor(
    private client: OpenIDClientParts,
    private devices: MediaDevices,
    private processorState$: Behavior<ProcessorState>,
    private e2eeLivekitOptions: E2EEOptions | undefined,
    private controlledAudioDevices: boolean,
    livekitRoomFactory?: () => LivekitRoom,
  ) {
    const defaultFactory = (): LivekitRoom =>
      new LivekitRoom(
        generateRoomOption(
          this.devices,
          this.processorState$.value,
          this.e2eeLivekitOptions,
          this.controlledAudioDevices,
        ),
      );
    this.livekitRoomFactory = livekitRoomFactory ?? defaultFactory;
  }

  public createConnection(
    transport: LivekitTransport,
    scope: ObservableScope,
    logger: Logger,
  ): Connection {
    return new Connection(
      {
        transport,
        client: this.client,
        scope: scope,
        livekitRoomFactory: this.livekitRoomFactory,
      },
      logger,
    );
  }
}

/**
 *  Generate the initial LiveKit RoomOptions based on the current media devices and processor state.
 */
function generateRoomOption(
  devices: MediaDevices,
  processorState: ProcessorState,
  e2eeLivekitOptions: E2EEOptions | undefined,
  controlledAudioDevices: boolean,
): RoomOptions {
  return {
    ...defaultLiveKitOptions,
    videoCaptureDefaults: {
      ...defaultLiveKitOptions.videoCaptureDefaults,
      deviceId: devices.videoInput.selected$.value?.id,
      processor: processorState.processor,
    },
    audioCaptureDefaults: {
      ...defaultLiveKitOptions.audioCaptureDefaults,
      deviceId: devices.audioInput.selected$.value?.id,
    },
    audioOutput: {
      // When using controlled audio devices, we don't want to set the
      // deviceId here, because it will be set by the native app.
      // (also the id does not need to match a browser device id)
      deviceId: controlledAudioDevices
        ? undefined
        : devices.audioOutput.selected$.value?.id,
    },
    e2ee: e2eeLivekitOptions,
    // TODO test and consider this:
    // webAudioMix: true,
  };
}
