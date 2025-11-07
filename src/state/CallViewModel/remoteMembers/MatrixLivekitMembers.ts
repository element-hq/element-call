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
import { type Room as MatrixRoom } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior";
import { type IConnectionManager } from "./ConnectionManager";
import { Epoch, mapEpoch, type ObservableScope } from "../../ObservableScope";
import { memberDisplaynames$ } from "./displayname";
import { type Connection } from "./Connection";
import { generateItemsWithEpoch } from "../../../utils/observable";

/**
 * Represents a Matrix call member and their associated LiveKit participation.
 * `livekitParticipant` can be undefined if the member is not yet connected to the livekit room
 * or if it has no livekit transport at all.
 */
export interface MatrixLivekitMember {
  participantId: string;
  userId: string;
  membership$: Behavior<CallMembership>;
  participant$: Behavior<
    LocalLivekitParticipant | RemoteLivekitParticipant | null
  >;
  connection$: Behavior<Connection | undefined>;
  displayName$: Behavior<string>;
  mxcAvatarUrl$: Behavior<string | undefined>;
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
        ]) =>
          new Epoch(
            [membershipsWithTransports, managerData, displaynames] as const,
            epoch,
          ),
      ),
      generateItemsWithEpoch(
        function* ([membershipsWithTransports, managerData, displaynames]) {
          for (const { membership, transport } of membershipsWithTransports) {
            // TODO! cannot use membership.membershipID yet, Currently its hardcoded by the jwt service to
            const participantId = /*membership.membershipID*/ `${membership.userId}:${membership.deviceId}`;

            const participants = transport
              ? managerData.getParticipantForTransport(transport)
              : [];
            const participant =
              participants.find((p) => p.identity == participantId) ?? null;
            // This makes sense to add to the js-sdk callMembership (we only need the avatar so probably the call memberhsip just should aquire the avatar)
            const member = matrixRoom.getMember(membership.userId);
            const connection = transport
              ? managerData.getConnectionForTransport(transport)
              : undefined;

            let displayName = displaynames.get(membership.userId);
            if (displayName === undefined) {
              logger.warn(`No display name for user ${membership.userId}`);
              displayName = "";
            }

            yield {
              keys: [participantId, membership.userId],
              data: {
                membership,
                participant,
                connection,
                displayName,
                mxcAvatarUrl: member?.getMxcAvatarUrl(),
              },
            };
          }
        },
        (scope, data$, participantId, userId) => ({
          participantId,
          userId,
          ...scope.splitBehavior(data$),
        }),
      ),
    ),
  );
}

// TODO add back in the callviewmodel pauseWhen(this.pretendToBeDisconnected$)

// TODO add this to the JS-SDK
export function areLivekitTransportsEqual(
  t1: LivekitTransport | null,
  t2: LivekitTransport | null,
): boolean {
  if (t1 && t2) return t1.livekit_service_url === t2.livekit_service_url;
  // In case we have different lk rooms in the same SFU (depends on the livekit authorization service)
  // It is only needed in case the livekit authorization service is not behaving as expected (or custom implementation)
  if (!t1 && !t2) return true;
  return false;
}
