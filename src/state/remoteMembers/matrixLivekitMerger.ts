/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type RemoteParticipant,
  type Participant as LivekitParticipant,
} from "livekit-client";
import {
  isLivekitTransport,
  type LivekitTransport,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, startWith, type Observable } from "rxjs";

import type { Room as MatrixRoom, RoomMember } from "matrix-js-sdk";
// import type { Logger } from "matrix-js-sdk/lib/logger";
import { type Behavior } from "../Behavior";
import { type ObservableScope } from "../ObservableScope";
import { type ConnectionManager } from "./ConnectionManager";
import { getRoomMemberFromRtcMember } from "./displayname";

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
   * Stream of all the call members and their associated livekit data (if available).
   */
  public matrixLivekitItems$: Behavior<MatrixLivekitItem[]>;

  // private readonly logger: Logger;

  public constructor(
    private memberships$: Observable<CallMembership[]>,
    private connectionManager: ConnectionManager,
    private scope: ObservableScope,
    // TODO this is too much information for that class,
    // apparently needed to get a room member to later get the Avatar
    // => Extract an AvatarService instead?
    private matrixRoom: MatrixRoom,
    // parentLogger: Logger,
  ) {
    // this.logger = parentLogger.getChild("MatrixLivekitMerger");

    this.matrixLivekitItems$ = this.scope.behavior(
      this.start$().pipe(startWith([])),
    );
  }

  // =======================================
  /// PRIVATES
  // =======================================
  private start$(): Observable<MatrixLivekitItem[]> {
    const membershipsWithTransport$ =
      this.mapMembershipsToMembershipWithTransport$();

    this.startFeedingConnectionManager(membershipsWithTransport$);

    return combineLatest([
      membershipsWithTransport$,
      this.connectionManager.allParticipantsByMemberId$,
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
    );
  }

  private startFeedingConnectionManager(
    membershipsWithTransport$: Behavior<
      { membership: CallMembership; transport?: LivekitTransport }[]
    >,
  ): void {
    const transports$ = this.scope.behavior(
      membershipsWithTransport$.pipe(
        map((mts) => mts.flatMap(({ transport: t }) => (t ? [t] : []))),
      ),
    );
    // duplicated transports will be elimiated by the connection manager
    this.connectionManager.registerTransports(transports$);
  }

  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  private mapMembershipsToMembershipWithTransport$(): Observable<
    { membership: CallMembership; transport?: LivekitTransport }[]
  > {
    return this.scope.behavior(
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
  }
}

// TODO add back in the callviewmodel pauseWhen(this.pretendToBeDisconnected$)

// TODO add this to the JS-SDK
export function areLivekitTransportsEqual(
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
