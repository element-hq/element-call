/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalParticipant as LocalLivekitParticipant,
  type RemoteParticipant as RemoteLivekitParticipant,
} from "livekit-client";
import {
  type LivekitTransport,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, startWith, type Observable } from "rxjs";
// eslint-disable-next-line rxjs/no-internal
import { type NodeStyleEventEmitter } from "rxjs/internal/observable/fromEvent";

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
export interface MatrixLivekitMember {
  membership: CallMembership;
  displayName$: Behavior<string>;
  participant?: LocalLivekitParticipant | RemoteLivekitParticipant;
  connection?: Connection;
  /**
   * TODO Try to remove this! Its waaay to much information.
   * Just get the member's avatar
   * @deprecated
   */
  member: RoomMember;
  mxcAvatarUrl?: string;
  participantId: string;
}

// Alternative structure idea:
// const livekitMatrixMember$ = (callMemberships$,connectionManager,scope): Observable<MatrixLivekitMember[]> => {

/**
 * Combines MatrixRtc and Livekit worlds.
 *
 * It has a small public interface:
 *  - in (via constructor):
 *    - an observable of CallMembership[] to track the call members (The matrix side)
 *    - a `ConnectionManager` for the lk rooms (The livekit side)
 *  - out (via public Observable):
 *    - `remoteMatrixLivekitMember` an observable of MatrixLivekitMember[] to track the remote members and associated livekit data.
 */
export class MatrixLivekitMerger {
  /**
   * Stream of all the call members and their associated livekit data (if available).
   */
  public matrixLivekitMember$: Behavior<MatrixLivekitMember[]>;

  // private readonly logger: Logger;

  public constructor(
    private scope: ObservableScope,
    private membershipsWithTransport$: Behavior<
      { membership: CallMembership; transport?: LivekitTransport }[]
    >,
    private connectionManager: ConnectionManager,
    // TODO this is too much information for that class,
    // apparently needed to get a room member to later get the Avatar
    // => Extract an AvatarService instead?
    // Better with just `getMember`
    private matrixRoom: Pick<MatrixRoom, "getMember"> & NodeStyleEventEmitter,
    private userId: string,
    private deviceId: string,
    // parentLogger: Logger,
  ) {
    // this.logger = parentLogger.getChild("MatrixLivekitMerger");

    this.matrixLivekitMember$ = this.scope.behavior(
      this.start$().pipe(startWith([])),
    );
  }

  // =======================================
  /// PRIVATES
  // =======================================
  private start$(): Observable<MatrixLivekitMember[]> {
    const displaynameMap$ = memberDisplaynames$(
      this.scope,
      this.matrixRoom,
      this.membershipsWithTransport$.pipe(
        map((v) => v.map((v) => v.membership)),
      ),
      this.userId,
      this.deviceId,
    );
    const membershipsWithTransport$ = this.membershipsWithTransport$;

    return combineLatest([
      membershipsWithTransport$,
      this.connectionManager.connectionManagerData$,
    ]).pipe(
      map(([memberships, managerData]) => {
        const items: MatrixLivekitMember[] = memberships.map(
          ({ membership, transport }) => {
            // TODO! cannot use membership.membershipID yet, Currently its hardcoded by the jwt service to
            const participantId = /*membership.membershipID*/ `${membership.userId}:${membership.deviceId}`;

            const participants = transport
              ? managerData.getParticipantForTransport(transport)
              : [];
            const participant = participants.find(
              (p) => p.identity == participantId,
            );
            const member = getRoomMemberFromRtcMember(
              membership,
              this.matrixRoom,
            )?.member;
            const connection = transport
              ? managerData.getConnectionForTransport(transport)
              : undefined;
            const displayName$ = this.scope.behavior(
              displaynameMap$.pipe(
                map(
                  (displayNameMap) =>
                    displayNameMap.get(membership.membershipID) ?? "---",
                ),
              ),
            );
            return {
              participant,
              membership,
              connection,
              // This makes sense to add the the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
              member,
              displayName$,
              mxcAvatarUrl: member?.getMxcAvatarUrl(),
              participantId,
            };
          },
        );
        return items;
      }),
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
