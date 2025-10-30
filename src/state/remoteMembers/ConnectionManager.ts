// TODOs:
// - make ConnectionManager its own actual class

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LivekitTransport,
  type ParticipantId,
} from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, combineLatest, map, switchMap } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type E2EEOptions,
  Room as LivekitRoom,
  type Participant as LivekitParticipant,
  type RoomOptions,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";

import { type Behavior } from "../Behavior";
import { Connection } from "./Connection";
import { type ObservableScope } from "../ObservableScope";
import { generateKeyed$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "./matrixLivekitMerger";
import { getUrlParams } from "../../UrlParams";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../MediaDevices";
import { defaultLiveKitOptions } from "../../livekit/options";

export type ParticipantByMemberIdMap = Map<
  ParticipantId,
  // It can be an array because a bad behaving client could be publishingParticipants$
  // multiple times to several livekit rooms.
  { participant: LivekitParticipant; connection: Connection }[]
>;
// TODO - write test for scopes (do we really need to bind scope)
export class ConnectionManager {
  private livekitRoomFactory: () => LivekitRoom;
  public constructor(
    private scope: ObservableScope,
    private client: MatrixClient,
    private devices: MediaDevices,
    private processorState$: Behavior<ProcessorState>,
    private e2eeLivekitOptions: E2EEOptions | undefined,
    private logger?: Logger,
    livekitRoomFactory?: () => LivekitRoom,
  ) {
    this.scope = scope;
    const defaultFactory = (): LivekitRoom =>
      new LivekitRoom(
        generateRoomOption(
          this.devices,
          this.processorState$.value,
          this.e2eeLivekitOptions,
        ),
      );
    this.livekitRoomFactory = livekitRoomFactory ?? defaultFactory;
  }

  /**
   * A list of Behaviors each containing a LIST of LivekitTransport.
   * Each of these behaviors can be interpreted as subscribed list of transports.
   *
   * Using `registerTransports` independent external modules can control what connections
   * are created by the ConnectionManager.
   *
   * The connection manager will remove all duplicate transports in each subscibed list.
   *
   * See `unregisterAllTransports` and `unregisterTransport` for details on how to unsubscribe.
   */
  private readonly transportsSubscriptions$ = new BehaviorSubject<
    Behavior<LivekitTransport[]>[]
  >([]);

  /**
   * All transports currently managed by the ConnectionManager.
   *
   * This list does not include duplicate transports.
   *
   * It is build based on the list of subscribed transports (`transportsSubscriptions$`).
   * externally this is modified via `registerTransports()`.
   */
  private readonly transports$ = this.scope.behavior(
    this.transportsSubscriptions$.pipe(
      switchMap((subscriptions) =>
        combineLatest(subscriptions).pipe(
          map((transportsNested) => transportsNested.flat()),
          map(removeDuplicateTransports),
        ),
      ),
    ),
  );

  /**
   * Connections for each transport in use by one or more session members.
   */
  private readonly connections$ = this.scope.behavior(
    generateKeyed$<LivekitTransport[], Connection, Connection[]>(
      this.transports$,
      (transports, createOrGet) => {
        const createConnection =
          (
            transport: LivekitTransport,
          ): ((scope: ObservableScope) => Connection) =>
          (scope) => {
            const connection = new Connection(
              {
                transport,
                client: this.client,
                scope: scope,
                livekitRoomFactory: this.livekitRoomFactory,
              },
              this.logger,
            );
            void connection.start();
            return connection;
          };

        const connections = transports.map((transport) => {
          const key =
            transport.livekit_service_url + "|" + transport.livekit_alias;
          return createOrGet(key, createConnection(transport));
        });

        return connections;
      },
    ),
  );

  /**
   * Add an a Behavior containing a list of transports to this ConnectionManager.
   *
   * The intended usage is:
   *  - create a ConnectionManager
   *  - register one `transports$` behavior using registerTransports
   *  - add new connections to the `ConnectionManager` by updating the `transports$` behavior
   *  - remove a single connection by removing the transport.
   *  - remove this subscription by calling `unregisterTransports` and passing
   *    the same `transports$` behavior reference.
   * @param transports$ The Behavior containing a list of transports to subscribe to.
   */
  public registerTransports(
    transports$: Behavior<LivekitTransport[]>,
  ): Connection[] {
    if (!this.transportsSubscriptions$.value.some((t$) => t$ === transports$)) {
      this.transportsSubscriptions$.next(
        this.transportsSubscriptions$.value.concat(transports$),
      );
    }
    // After updating the subscriptions our connection list is also updated.
    return transports$.value
      .map((transport) => {
        const isConnectionForTransport = (connection: Connection): boolean =>
          areLivekitTransportsEqual(connection.transport, transport);
        return this.connections$.value.find(isConnectionForTransport);
      })
      .filter((c) => c !== undefined);
  }

  /**
   * Unsubscribe from the given transports.
   * @param transports$ The behavior to unsubscribe from
   * @returns
   */
  public unregisterTransports(
    transports$: Behavior<LivekitTransport[]>,
  ): boolean {
    const subscriptions = this.transportsSubscriptions$.value;
    const subscriptionsUnregistered = subscriptions.filter(
      (t$) => t$ !== transports$,
    );
    const canUnregister =
      subscriptions.length !== subscriptionsUnregistered.length;
    if (canUnregister)
      this.transportsSubscriptions$.next(subscriptionsUnregistered);
    return canUnregister;
  }

  /**
   * Unsubscribe from all transports.
   */
  public unregisterAllTransports(): void {
    this.transportsSubscriptions$.next([]);
  }

  // We have a lost of connections, for each of these these
  // connection we create a stream of (participant, connection) tuples.
  // Then we combine the several streams (1 per Connection) into a single stream of tuples.
  private allParticipantsWithConnection$ = this.scope.behavior(
    this.connections$.pipe(
      switchMap((connections) => {
        const listsOfParticipantWithConnection = connections.map(
          (connection) => {
            return connection.participantsWithTrack$.pipe(
              map((participants) =>
                participants.map((p) => ({
                  participant: p,
                  connection,
                })),
              ),
            );
          },
        );
        return combineLatest(listsOfParticipantWithConnection).pipe(
          map((lists) => lists.flatMap((list) => list)),
        );
      }),
    ),
  );

  /**
   * This field makes the connection manager to behave as close to a single SFU as possible.
   * Each participant that is found on all connections managed by the manager will be listed.
   *
   * They are stored an a map keyed by `participant.identity`
   * (which is equivalent to the `member.id` field in the `m.rtc.member` event)
   */
  public allParticipantsByMemberId$ = this.scope.behavior(
    this.allParticipantsWithConnection$.pipe(
      map((participantsWithConnections) => {
        const participantsByMemberId = participantsWithConnections.reduce(
          (acc, test) => {
            const { participant, connection } = test;
            if (participant.getTrackPublications().length > 0) {
              const currentVal = acc.get(participant.identity);
              if (!currentVal) {
                acc.set(participant.identity, [{ connection, participant }]);
              } else {
                // already known
                // This is for users publishing on several SFUs
                currentVal.push({ connection, participant });
                this.logger?.info(
                  `Participant ${participant.identity} is publishing on several SFUs ${currentVal.map((v) => v.connection.transport.livekit_service_url).join(", ")}`,
                );
              }
            }
            return acc;
          },
          new Map() as ParticipantByMemberIdMap,
        );

        return participantsByMemberId;
      }),
    ),
  );
}
function removeDuplicateTransports(
  transports: LivekitTransport[],
): LivekitTransport[] {
  return transports.reduce((acc, transport) => {
    if (!acc.some((t) => areLivekitTransportsEqual(t, transport)))
      acc.push(transport);
    return acc;
  }, [] as LivekitTransport[]);
}

/**
 *  Generate the initial LiveKit RoomOptions based on the current media devices and processor state.
 */
function generateRoomOption(
  devices: MediaDevices,
  processorState: ProcessorState,
  e2eeLivekitOptions: E2EEOptions | undefined,
): RoomOptions {
  const { controlledAudioDevices } = getUrlParams();
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
