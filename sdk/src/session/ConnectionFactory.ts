/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type BaseKeyProvider,
  Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
// Inline so that the worker also loads when the SDK is served from another
// origin than the page
import E2EEWorker from "livekit-client/e2ee-worker?worker&inline";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { BehaviorSubject, combineLatest, map } from "rxjs";

import { buildLiveKitOptions } from "./livekitOptions";
import { type OpenIDClientParts, type SFUConfig } from "./openIDSFU";
import { type Behavior } from "../reactive/Behavior";
import { Connection, type ConnectionOpts, ConnectionState } from "./Connection";
import { type ObservableScope } from "../reactive/ObservableScope";
import {
  type CaptureSettings,
  type LocalMediaInputs,
  type ResolvedTransport,
} from "../api";
import { type MediaQuality } from "../config";

export interface ConnectionFactory {
  createConnection(
    scope: ObservableScope,
    transport: LivekitTransport,
    ownMembershipIdentity: CallMembershipIdentityParts,
    logger: Logger,
    sfuConfig?: SFUConfig,
  ): Connection;
}

/**
 * A connection that keeps what it fetched from the JWT service, so that the
 * transport can report it as `resolved$`. Nothing while the config is still
 * being fetched, and nothing again once the connection has stopped or failed.
 */
export class ResolvedConnection extends Connection {
  private readonly sfuConfig$: BehaviorSubject<SFUConfig | undefined>;
  public readonly resolved$: Behavior<ResolvedTransport | undefined>;

  public constructor(opts: ConnectionOpts, logger: Logger) {
    super(opts, logger);
    this.sfuConfig$ = new BehaviorSubject(opts.existingSFUConfig);
    this.resolved$ = opts.scope.behavior(
      combineLatest([this.sfuConfig$, this.state$]).pipe(
        map(([config, state]) =>
          config === undefined ||
          state === ConnectionState.Stopped ||
          state instanceof Error
            ? undefined
            : resolvedTransport(config),
        ),
      ),
    );
  }

  protected override async getSFUConfigForRemoteConnection(): Promise<SFUConfig> {
    const config = await super.getSFUConfigForRemoteConnection();
    this.sfuConfig$.next(config);
    return config;
  }
}

function resolvedTransport(config: SFUConfig): ResolvedTransport {
  return {
    type: "livekit",
    url: config.url,
    token: config.jwt,
    roomAlias: config.livekitAlias,
    identity: config.livekitIdentity,
  };
}

/**
 * Creates a `ResolvedConnection` per transport, each with a LiveKit room of
 * its own that captures from the devices the host selected.
 */
export class LivekitConnectionFactory implements ConnectionFactory {
  public constructor(
    private readonly client: OpenIDClientParts,
    private readonly roomId: string,
    private readonly localMedia: LocalMediaInputs,
    private readonly keyProvider: BaseKeyProvider | undefined,
    private readonly mediaQuality: MediaQuality | undefined,
    private readonly capture: CaptureSettings | undefined,
  ) {}

  public createConnection(
    scope: ObservableScope,
    transport: LivekitTransport,
    ownMembershipIdentity: CallMembershipIdentityParts,
    logger: Logger,
    sfuConfig?: SFUConfig,
  ): Connection {
    return new ResolvedConnection(
      {
        existingSFUConfig: sfuConfig,
        roomId: this.roomId,
        transport,
        client: this.client,
        scope,
        livekitRoomFactory: () =>
          new LivekitRoom(
            roomOptions(
              this.localMedia,
              this.keyProvider,
              this.mediaQuality,
              this.capture,
            ),
          ),
        ownMembershipIdentity,
      },
      logger,
    );
  }
}

function roomOptions(
  localMedia: LocalMediaInputs,
  keyProvider: BaseKeyProvider | undefined,
  mediaQuality: MediaQuality | undefined,
  capture: CaptureSettings | undefined,
): RoomOptions {
  const base = buildLiveKitOptions(mediaQuality);
  const camera = capture?.camera;
  return {
    ...base,
    videoCaptureDefaults: {
      ...base.videoCaptureDefaults,
      deviceId: localMedia.videoInputDeviceId$.value,
      processor: localMedia.videoProcessor$.value,
      ...(camera?.resolution && { resolution: camera.resolution }),
    },
    publishDefaults: {
      ...base.publishDefaults,
      ...(camera?.maxBitrate !== undefined && {
        videoEncoding: {
          maxBitrate: camera.maxBitrate,
          maxFramerate: camera.maxFramerate,
        },
      }),
      ...(camera?.codec && { videoCodec: camera.codec }),
    },
    audioCaptureDefaults: {
      ...base.audioCaptureDefaults,
      deviceId: localMedia.audioInputDeviceId$.value,
      ...capture?.audio,
    },
    audioOutput: { deviceId: localMedia.audioOutputDeviceId$.value },
    // Every room needs a worker of its own: one gets confused by streams from
    // several rooms
    e2ee: keyProvider && { keyProvider, worker: new E2EEWorker() },
  };
}
