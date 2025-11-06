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
import { logger } from "matrix-js-sdk/lib/logger";
import {
  combineLatest,
  filter,
  fromEvent,
  map,
  startWith,
  switchMap,
  type Observable,
} from "rxjs";
// eslint-disable-next-line rxjs/no-internal
import { type NodeStyleEventEmitter } from "rxjs/internal/observable/fromEvent";
import {
  RoomStateEvent,
  type Room as MatrixRoom,
  type RoomMember,
} from "matrix-js-sdk";

// import type { Logger } from "matrix-js-sdk/lib/logger";
import { type Behavior } from "../Behavior";
import { type ObservableScope } from "../ObservableScope";
import { type createConnectionManager$ } from "./ConnectionManager";
import { getRoomMemberFromRtcMember, memberDisplaynames$ } from "./displayname";
import { type Connection } from "./Connection";
import { generateItems$ } from "../../utils/observable";

/**
 * Represent a matrix call member and his associated livekit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */
export interface MatrixLivekitMember {
  participantId: string;
  membership$: Behavior<CallMembership>;
  displayName$: Behavior<string>;
  participant$:
    | Behavior<LocalLivekitParticipant | undefined>
    | Behavior<RemoteLivekitParticipant | undefined>;
  connection$: Behavior<Connection | undefined>;
  mxcAvatarUrl$: Behavior<string | undefined>;
  /**
   * TODO Try to remove this! Its waaay to much information.
   * Just get the member's avatar
   * @deprecated
   */
  member$: Behavior<RoomMember>;
}

interface Props {
  scope: ObservableScope;
  membershipsWithTransport$: Behavior<
    { membership: CallMembership; transport?: LivekitTransport }[]
  >;
  connectionManager: ReturnType<typeof createConnectionManager$>;
  // TODO this is too much information for that class,
  // apparently needed to get a room member to later get the Avatar
  // => Extract an AvatarService instead?
  // Better with just `getMember`
  matrixRoom: Pick<MatrixRoom, "getMember"> & NodeStyleEventEmitter;
  userId: string;
  deviceId: string;
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
  userId,
  deviceId,
}: Props): Behavior<MatrixLivekitMember[]> {
  /**
   * Stream of all the call members and their associated livekit data (if available).
   */

  function createMatrixLivekitMember$(): Observable<MatrixLivekitMember[]> {
    const displayNameMap$ = memberDisplaynames$(
      scope,
      matrixRoom,
      membershipsWithTransport$.pipe(map((v) => v.map((v) => v.membership))),
      userId,
      deviceId,
    );

    return generateItems$(
      combineLatest([
        membershipsWithTransport$,
        connectionManager.connectionManagerData$,
      ]),
      function* ([memberships, managerData]) {
        for (const { membership, transport } of memberships) {
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
          if (member === undefined) {
            logger.warn(`No room member for participant ${participantId}`);
            continue;
          }

          const connection = transport
            ? managerData.getConnectionForTransport(transport)
            : undefined;

          yield {
            key: participantId,
            data: {
              participant,
              membership,
              connection,
              // This makes sense to add the the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
              member,
            },
          };
        }
      },
      (scope, participantId, data$): MatrixLivekitMember => ({
        participantId,
        membership$: scope.behavior(data$.pipe(map((data) => data.membership))),
        displayName$: scope.behavior(
          displayNameMap$.pipe(
            map((displayNames) => displayNames.get(participantId)),
            filter((name) => name !== undefined),
          ),
          "",
        ),
        participant$: scope.behavior(
          data$.pipe(map((data) => data.participant)),
          // Assert that a local participant will never become a remote
          // participant or vice versa
        ) as
          | Behavior<LocalLivekitParticipant | undefined>
          | Behavior<RemoteLivekitParticipant | undefined>,
        connection$: scope.behavior(data$.pipe(map((data) => data.connection))),
        mxcAvatarUrl$: scope.behavior(
          // React to avatar changes
          fromEvent(matrixRoom, RoomStateEvent.Members).pipe(
            startWith(null),
            switchMap(() =>
              data$.pipe(map((data) => data.member.getMxcAvatarUrl())),
            ),
          ),
        ),
        member$: scope.behavior(data$.pipe(map((data) => data.member))),
      }),
    );
  }

  return scope.behavior(createMatrixLivekitMember$().pipe(startWith([])));
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
