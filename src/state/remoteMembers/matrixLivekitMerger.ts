/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  LocalParticipant,
  Participant,
  RemoteParticipant,
  type Participant as LivekitParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  type CallMembership,
  type Transport,
  LivekitTransport,
  isLivekitTransport,
  ParticipantId,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  combineLatest,
  map,
  startWith,
  switchMap,
  type Observable,
} from "rxjs";

import { type ObservableScope } from "../ObservableScope";
import { type Connection } from "./Connection";
import { Behavior, constant } from "../Behavior";
import { Room as MatrixRoom, RoomMember } from "matrix-js-sdk";
import { getRoomMemberFromRtcMember } from "./displayname";
import { pauseWhen } from "../../utils/observable";
import { Logger } from "matrix-js-sdk/lib/logger";

// TODOs:
// - make ConnectionManager its own actual class
// - write test for scopes (do we really need to bind scope)
class ConnectionManager {
  public setTansports(transports$: Behavior<Transport[]>): void {}
  public readonly connections$: Observable<Connection[]> = constant([]);
  // connection is used to find the transport (to find matching callmembership) & for the livekitRoom
  public readonly participantsByMemberId$: Behavior<ParticipantByMemberIdMap> =
    constant(new Map());
}

export type ParticipantByMemberIdMap = Map<
  ParticipantId,
  // It can be an array because a bad behaving client could be publishingParticipants$
  // multiple times to several livekit rooms.
  { participant: LivekitParticipant; connection: Connection }[]
>;

/**
 * Represents participant publishing or expected to publish on the connection.
 * It is paired with its associated rtc membership.
 */
export type PublishingParticipant = {
  /**
   * The LiveKit participant publishing on this connection, or undefined if the participant is not currently (yet) connected to the livekit room.
   */
  participant: RemoteParticipant | undefined;
  /**
   * The rtc call membership associated with this participant.
   */
  membership: CallMembership;
};

/**
 * Represent a matrix call member and his associated livekit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */
export interface MatrixLivekitItem {
  membership: CallMembership;
  livekitParticipant?: LivekitParticipant;
  //TODO Try to remove this! Its waaay to much information
  // Just use to get the member's avatar
  member?: RoomMember;
}

// Alternative structure idea:
// const livekitMatrixItems$ = (callMemberships$,connectionManager,scope): Observable<MatrixLivekitItem[]> => {

interface LivekitRoomWithParticipants {
  livekitRoom: LivekitRoom;
  url: string; // Included for use as a React key
  participants: {
    // What id is that??
    // Looks like it userId:Deviceid?
    id: string;
    participant: LocalParticipant | RemoteParticipant | undefined;
    // Why do we fetch a full room member here?
    // looks like it is only for avatars?
    // TODO: Remove that. have some Avatar Provider that can fetch avatar for user ids.
    member: RoomMember;
  }[];
}

/**
 * Combines MatrixRtc and Livekit worlds.
 *
 * It has a small public interface:
 *  - in (via constructor):
 *    - an observable of CallMembership[] to track the call members (The matrix side)
 *    - a `ConnectionManager` for the lk rooms (The livekit side)
 *  - out (via public Observable):
 *    - `remoteMatrixLivekitItems` an observable of MatrixLivekitItem[] to track the remote members and associated livekit data.
 */
export class MatrixLivekitMerger {
  private readonly logger: Logger;

  
  public constructor(
    private memberships$: Observable<CallMembership[]>,
    private connectionManager: ConnectionManager,
    private scope: ObservableScope,
    // TODO this is too much information for that class,
    // apparently needed to get a room member to later get the Avatar
    // => Extract an AvatarService instead?
    private matrixRoom: MatrixRoom,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.createChildLogger("MatrixLivekitMerger");
    connectionManager.setTansports(this.transports$);
  }

  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  private readonly membershipsWithTransport$ = this.scope.behavior(
    this.memberships$.pipe(
      map((memberships) => {
        return memberships.map((membership) => {
          const oldestMembership = memberships[0] ?? membership;
          const transport = membership.getTransport(oldestMembership);
          return {
            membership,
            transport: isLivekitTransport(transport) ? transport : undefined,
          };
        });
      }),
    ),
  );

  private readonly transports$ = this.scope.behavior(
    this.membershipsWithTransport$.pipe(
      map((membershipsWithTransport) =>
        membershipsWithTransport.reduce((acc, { transport }) => {
          if (
            transport &&
            !acc.some((t) => areLivekitTransportsEqual(t, transport))
          ) {
            acc.push(transport);
          }
          return acc;
        }, [] as LivekitTransport[]),
      ),
    ),
  );

  // TODO move this over this the connection manager
  // We have a lost of connections, for each of these these
  // connection we create a stream of (participant, connection) tuples.
  // Then we combine the several streams (1 per Connection) into a single stream of tuples.
  private participantsWithConnection$ =
    this.connectionManager.connections$.pipe(
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
    );

  // TODO move this over this the connection manager
  // Filters the livekit partic
  private participantsByMemberId$ = this.participantsWithConnection$.pipe(
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
              this.logger.info(
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
  );

  public readonly matrixLivekitItems$ = this.scope
    .behavior<MatrixLivekitItem[]>(
      combineLatest([
        this.membershipsWithTransport$,
        this.participantsByMemberId$,
      ]).pipe(
        map(([memberships, participantsByMemberId]) => {
          const items = memberships.map(({ membership, transport }) => {
            const participantsWithConnection = participantsByMemberId.get(
              membership.membershipID,
            );
            const participant =
              transport &&
              participantsWithConnection?.find((p) =>
                areLivekitTransportsEqual(p.connection.transport, transport),
              );
            return {
              livekitParticipant: participant,
              membership,
              // This makes sense to add the the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
              member:
                // Why a member error? if we have a call membership there is a room member
                getRoomMemberFromRtcMember(membership, this.matrixRoom)?.member,
            } as MatrixLivekitItem;
          });
          return items;
        }),
      ),
    )
    .pipe(startWith([]));
}

// TODO add back in the callviewmodel pauseWhen(this.pretendToBeDisconnected$)

// TODO add this to the JS-SDK
function areLivekitTransportsEqual(
  t1: LivekitTransport,
  t2: LivekitTransport,
): boolean {
  return (
    t1.livekit_service_url === t2.livekit_service_url &&
    // In case we have different lk rooms in the same SFU (depends on the livekit authorization service)
    // It is only needed in case the livekit authorization service is not behaving as expected (or custom implementation)
    t1.livekit_alias === t2.livekit_alias
  );
}
