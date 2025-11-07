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
import { combineLatest, filter, map } from "rxjs";
// eslint-disable-next-line rxjs/no-internal
import { type NodeStyleEventEmitter } from "rxjs/internal/observable/fromEvent";
import { type Room as MatrixRoom, type RoomMember } from "matrix-js-sdk";

import { type Behavior } from "../../Behavior";
import { type IConnectionManager } from "./ConnectionManager";
import { Epoch, mapEpoch, type ObservableScope } from "../../ObservableScope";
import { getRoomMemberFromRtcMember, memberDisplaynames$ } from "./displayname";
import { type Connection } from "./Connection";

/**
 * Represent a matrix call member and his associated livekit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */
export interface MatrixLivekitMember {
  membership: CallMembership;
  displayName?: string;
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

interface Props {
  scope: ObservableScope;
  membershipsWithTransport$: Behavior<
    Epoch<{ membership: CallMembership; transport?: LivekitTransport }[]>
  >;
  connectionManager: IConnectionManager;
  // TODO this is too much information for that class,
  // apparently needed to get a room member to later get the Avatar
  // => Extract an AvatarService instead?
  // Better with just `getMember`
  matrixRoom: Pick<MatrixRoom, "getMember"> & NodeStyleEventEmitter;
  // roomMember$: Behavior<Pick<RoomMember, "userId" | "getMxcAvatarUrl">>;
}
// Alternative structure idea:
// const livekitMatrixMember$ = (callMemberships$,connectionManager,scope): Observable<MatrixLivekitMember[]> => {

/**
 * Combines MatrixRTC and Livekit worlds.
 *
 * It has a small public interface:
 *  - in (via constructor):
 *    - an observable of CallMembership[] to track the call members (The matrix side)
 *    - a `ConnectionManager` for the lk rooms (The livekit side)
 *  - out (via public Observable):
 *    - `remoteMatrixLivekitMember` an observable of MatrixLivekitMember[] to track the remote members and associated livekit data.
 */
export function createMatrixLivekitMembers$({
  scope,
  membershipsWithTransport$,
  connectionManager,
  matrixRoom,
}: Props): Behavior<Epoch<MatrixLivekitMember[]>> {
  /**
   * Stream of all the call members and their associated livekit data (if available).
   */

  const displaynameMap$ = memberDisplaynames$(
    scope,
    matrixRoom,
    membershipsWithTransport$.pipe(mapEpoch((v) => v.map((v) => v.membership))),
  );

  return scope.behavior(
    combineLatest([
      membershipsWithTransport$,
      connectionManager.connectionManagerData$,
      displaynameMap$,
    ]).pipe(
      filter((values) =>
        values.every((value) => value.epoch === values[0].epoch),
      ),
      map(
        ([
          { value: membershipsWithTransports, epoch },
          { value: managerData },
          { value: displaynames },
        ]) => {
          const items: MatrixLivekitMember[] = membershipsWithTransports.map(
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
                matrixRoom,
              )?.member;
              const connection = transport
                ? managerData.getConnectionForTransport(transport)
                : undefined;
              const displayName = displaynames.get(participantId);
              return {
                participant,
                membership,
                connection,
                // This makes sense to add to the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
                // TODO Ugh this is hidign that it might be undefined!! best we remove the member entirely.
                member: member as RoomMember,
                displayName,
                mxcAvatarUrl: member?.getMxcAvatarUrl(),
                participantId,
              };
            },
          );
          return new Epoch(items, epoch);
        },
      ),
    ),
    // new Epoch([]),
  );
}

// TODO add back in the callviewmodel pauseWhen(this.pretendToBeDisconnected$)

// TODO add this to the JS-SDK
export function areLivekitTransportsEqual(
  t1?: LivekitTransport,
  t2?: LivekitTransport,
): boolean {
  if (t1 && t2) return t1.livekit_service_url === t2.livekit_service_url;
  // In case we have different lk rooms in the same SFU (depends on the livekit authorization service)
  // It is only needed in case the livekit authorization service is not behaving as expected (or custom implementation)
  if (!t1 && !t2) return true;
  return false;
}
