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
import { type Behavior } from "../../reactive/Behavior";
import { Connection, type ConnectionOpts, ConnectionState } from "./Connection";
import { type ObservableScope } from "../../reactive/ObservableScope";
import { type ResolvedTransport } from "../../api";
import { type PublishRequest } from "../../media-api";
import { type MediaQuality } from "../../config";
import {
  audioCaptureOptions,
  type PublishRequestFor,
  videoCaptureOptions,
  videoPublishOptions,
} from "./publishOptions";

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
    // One object per fetch, so that a change of state does not read as a
    // change of what was fetched
    const resolved$ = this.sfuConfig$.pipe(
      map((config) => config && resolvedTransport(config)),
    );
    this.resolved$ = opts.scope.behavior(
      combineLatest([resolved$, this.state$]).pipe(
        map(([resolved, state]) =>
          state === ConnectionState.Stopped || state instanceof Error
            ? undefined
            : resolved,
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
    private readonly publish: PublishRequest[],
    private readonly audioOutputDeviceId$: Behavior<string | undefined>,
    private readonly keyProvider: BaseKeyProvider | undefined,
    private readonly mediaQuality: MediaQuality | undefined,
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
              this.publish,
              this.audioOutputDeviceId$.value,
              this.keyProvider,
              this.mediaQuality,
            ),
          ),
        ownMembershipIdentity,
      },
      logger,
    );
  }
}

/** The initial requests become the room's defaults, so that one permission prompt covers both. */
function roomOptions(
  publish: PublishRequest[],
  audioOutputDeviceId: string | undefined,
  keyProvider: BaseKeyProvider | undefined,
  mediaQuality: MediaQuality | undefined,
): RoomOptions {
  const base = buildLiveKitOptions(mediaQuality);
  const microphone = initialRequest(publish, "microphone");
  const camera = initialRequest(publish, "camera");
  return {
    ...base,
    videoCaptureDefaults: {
      ...base.videoCaptureDefaults,
      ...(camera && videoCaptureOptions(camera)),
    },
    publishDefaults: {
      ...base.publishDefaults,
      ...(camera && videoPublishOptions(camera.capture)),
    },
    audioCaptureDefaults: {
      ...base.audioCaptureDefaults,
      ...(microphone && audioCaptureOptions(microphone)),
    },
    audioOutput: { deviceId: audioOutputDeviceId },
    // Every room needs a worker of its own: one gets confused by streams from
    // several rooms
    e2ee: keyProvider && { keyProvider, worker: new E2EEWorker() },
  };
}

function initialRequest<S extends "microphone" | "camera">(
  publish: PublishRequest[],
  source: S,
): PublishRequestFor<S> | undefined {
  return publish.find(
    (request): request is PublishRequestFor<S> => request.source === source,
  );
}
