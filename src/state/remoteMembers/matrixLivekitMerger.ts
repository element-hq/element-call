/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Participant as LivekitParticipant } from "livekit-client";
import {
  isLivekitTransport,
  type LivekitTransport,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, startWith, type Observable } from "rxjs";
// eslint-disable-next-line rxjs/no-internal
import { type HasEventTargetAddRemove } from "rxjs/internal/observable/fromEvent";

import type { Room as MatrixRoom, RoomMember } from "matrix-js-sdk";
// import type { Logger } from "matrix-js-sdk/lib/logger";
import { type Behavior } from "../Behavior";
import { type ObservableScope } from "../ObservableScope";
import { type ConnectionManager } from "./ConnectionManager";
import { getRoomMemberFromRtcMember, memberDisplaynames$ } from "./displayname";
import { type Connection } from "./Connection";

/**
 * Represent a matrix call member and his associated livekit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */
export interface MatrixLivekitItem {
  membership: CallMembership;
  displayName: string;
  participant?: LivekitParticipant;
  connection?: Connection;
  /**
   * TODO Try to remove this! Its waaay to much information.
   * Just get the member's avatar
   * @deprecated
   */
  member?: RoomMember;
  mxcAvatarUrl?: string;
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
    private scope: ObservableScope,
    private memberships$: Observable<CallMembership[]>,
    private connectionManager: ConnectionManager,
    // TODO this is too much information for that class,
    // apparently needed to get a room member to later get the Avatar
    // => Extract an AvatarService instead?
    // Better with just `getMember`
    private matrixRoom: Pick<MatrixRoom, "getMember"> &
      HasEventTargetAddRemove<unknown>,
    private userId: string,
    private deviceId: string,
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
    const displaynameMap$ = memberDisplaynames$(
      this.scope,
      this.matrixRoom,
      this.memberships$,
      this.userId,
      this.deviceId,
    );
    const membershipsWithTransport$ =
      this.mapMembershipsToMembershipWithTransport$();

    this.startFeedingConnectionManager(membershipsWithTransport$);

    return combineLatest([
      membershipsWithTransport$,
      this.connectionManager.allParticipantsByMemberId$,
      displaynameMap$,
    ]).pipe(
      map(([memberships, participantsByMemberId, displayNameMap]) => {
        const items: MatrixLivekitItem[] = memberships.map(
          ({ membership, transport }) => {
            const participantsWithConnection = participantsByMemberId.get(
              // membership.membershipID, Currently its hardcoded by the jwt service to
              `${membership.userId}:${membership.deviceId}`,
            );
            const participant =
              transport &&
              participantsWithConnection?.find((p) =>
                areLivekitTransportsEqual(p.connection.transport, transport),
              );
            const member = getRoomMemberFromRtcMember(
              membership,
              this.matrixRoom,
            )?.member;
            return {
              ...participant,
              membership,
              // This makes sense to add the the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
              member,
              displayName: displayNameMap.get(membership.membershipID) ?? "---",
              mxcAvatarUrl: member?.getMxcAvatarUrl(),
            };
          },
        );
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
  private mapMembershipsToMembershipWithTransport$(): Behavior<
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
