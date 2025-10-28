/*
Copyright 2025 Element c.

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
} from "matrix-js-sdk/lib/matrixrtc";
import {
  combineLatest,
  fromEvent,
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

// TODOs:
// - make ConnectionManager its own actual class
// - write test for scopes (do we really need to bind scope)
class ConnectionManager {
  constructor(transports$: Observable<Transport[]>) {}
  public startWithMemberships(memberships$: Behavior<CallMembership[]>) {}
  public readonly connections$: Observable<Connection[]> = constant([]);
}

/**
 * Represent a matrix call member and his associated livekit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */

export interface MatrixLivekitItem {
  membership: CallMembership;
  livekitParticipant?: LivekitParticipant;
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
  /**
   * The MatrixRTC session participants.
   */
  // Note that MatrixRTCSession already filters the call memberships by users
  // that are joined to the room; we don't need to perform extra filtering here.
  public readonly memberships$ = this.scope.behavior(
    fromEvent(
      this.matrixRTCSession,
      MatrixRTCSessionEvent.MembershipsChanged,
    ).pipe(
      startWith(null),
      map(() => this.matrixRTCSession.memberships),
    ),
  );

  public constructor(
    private matrixRTCSession: MatrixRTCSession,
    private connectionManager: ConnectionManager,
    private scope: ObservableScope,
    private matrixRoom: MatrixRoom,
  ) {
    connectionManager.startWithMemberships(this.memberships$);
  }

  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  // TODO pass this over to our conncetions
  private readonly membershipsWithTransport$: Behavior<{
    membership: CallMembership;
    transport?: LivekitTransport;
  } | null> = this.scope.behavior(
    this.memberships$.pipe(
      map((memberships) => {
        const oldestMembership = this.matrixRTCSession.getOldestMembership();

        memberships.map((membership) => {
          let transport = membership.getTransport(
            oldestMembership ?? membership,
          );
          return {
            membership,
            transport: isLivekitTransport(transport) ? transport : undefined,
          };
        });
      }),
    ),
  );

  private allPublishingParticipants$ = this.connectionManager.connections$.pipe(
    switchMap((connections) => {
      const listOfPublishingParticipants = connections.map(
        (connection) => connection.publishingParticipants$,
      );
      return combineLatest(listOfPublishingParticipants).pipe(
        map((list) => list.flatMap((innerList) => innerList)),
      );
    }),
  );

  public readonly matrixLivekitItems$ = this.scope
    .behavior<MatrixLivekitItem[]>(
      this.allPublishingParticipants$.pipe(
        map((participants) => {
          const matrixLivekitItems: MatrixLivekitItem[] = participants.map(
            ({ participant, membership }) => ({
              participant,
              membership,
              id: `${membership.userId}:${membership.deviceId}`,
              // This makes sense to add the the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
              member:
                getRoomMemberFromRtcMember(membership, this.matrixRoom)
                  ?.member ?? memberError(),
            }),
          );
          return matrixLivekitItems;
        }),
      ),
    )
    .pipe(startWith([]), pauseWhen(this.pretendToBeDisconnected$));
}
