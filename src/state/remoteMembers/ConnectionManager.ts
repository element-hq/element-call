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
  type Room as LivekitRoom,
  type Participant as LivekitParticipant,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";

import { type Behavior } from "../Behavior";
import { type Connection, RemoteConnection } from "./Connection";
import { type ObservableScope } from "../ObservableScope";
import { generateKeyed$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "./matrixLivekitMerger";

export type ParticipantByMemberIdMap = Map<
  ParticipantId,
  // It can be an array because a bad behaving client could be publishingParticipants$
  // multiple times to several livekit rooms.
  { participant: LivekitParticipant; connection: Connection }[]
>;

// - write test for scopes (do we really need to bind scope)
export class ConnectionManager {
  /**
   * The transport to use for publishing.
   * This extends the list of tranports
   */
  private publishTransport$ = new BehaviorSubject<LivekitTransport | undefined>(
    undefined,
  );

  private transportSubscriptions$ = new BehaviorSubject<
    Behavior<LivekitTransport[]>[]
  >([]);

  private transports$ = this.scope.behavior(
    this.transportSubscriptions$.pipe(
      switchMap((subscriptions) =>
        combineLatest(subscriptions.map((s) => s.transports)).pipe(
          map((transportsNested) => transportsNested.flat()),
          map(removeDuplicateTransports),
        ),
      ),
    ),
  );

  public constructor(
    private client: MatrixClient,
    private e2eeLivekitOptions: () => E2EEOptions | undefined,
    private scope: ObservableScope,
    private logger?: Logger,
    private livekitRoomFactory?: () => LivekitRoom,
  ) {
    this.scope = scope;
  }

  public getOrCreatePublishConnection(
    transport: LivekitTransport,
  ): Connection | undefined {
    this.publishTransport$.next(transport);
    const equalsRequestedTransport = (c: Connection): boolean =>
      areLivekitTransportsEqual(c.transport, transport);
    return this.connections$.value.find(equalsRequestedTransport);
  }
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
          ): ((scope: ObservableScope) => RemoteConnection) =>
          (scope) => {
            const connection = new RemoteConnection(
              {
                transport,
                client: this.client,
                scope: scope,
                livekitRoomFactory: this.livekitRoomFactory,
              },
              this.e2eeLivekitOptions(),
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
   *
   * @param transports$
   */
  public registerTransports(
    transports$: Behavior<LivekitTransport[]>,
  ): Connection[] {
    if (!this.transportSubscriptions$.value.some((t$) => t$ === transports$)) {
      this.transportSubscriptions$.next(
        this.transportSubscriptions$.value.concat(transports$),
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

  public unregisterTransports(
    transports$: Behavior<LivekitTransport[]>,
  ): boolean {
    const subscriptions = this.transportSubscriptions$.value;
    const subscriptionsUnregistered = subscriptions.filter(
      (t$) => t$ !== transports$,
    );
    const canUnregister =
      subscriptions.length !== subscriptionsUnregistered.length;
    if (canUnregister)
      this.transportSubscriptions$.next(subscriptionsUnregistered);
    return canUnregister;
  }

  public unregisterAllTransports(): void {
    this.transportSubscriptions$.next([]);
  }

  // We have a lost of connections, for each of these these
  // connection we create a stream of (participant, connection) tuples.
  // Then we combine the several streams (1 per Connection) into a single stream of tuples.
  private allParticipantsWithConnection$ = this.scope.behavior(
    this.connections$.pipe(
      switchMap((connections) => {
        const listsOfParticipantWithConnection = connections.map(
          (connection) => {
            return connection.participantsWithPublishTrack$.pipe(
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

  // Filters the livekit participants
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
                // This is user is publishing on several SFUs
                currentVal.push({ connection, participant });
                this.logger?.info(
                  `Participant ${participant.identity} is publishing on several SFUs ${currentVal.join()}`,
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
