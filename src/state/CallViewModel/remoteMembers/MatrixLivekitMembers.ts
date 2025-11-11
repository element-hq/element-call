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
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior";
import { type IConnectionManager } from "./ConnectionManager";
import { Epoch, type ObservableScope } from "../../ObservableScope";
import { type Connection } from "./Connection";
import { generateItemsWithEpoch } from "../../../utils/observable";

const logger = rootLogger.getChild("MatrixLivekitMembers");

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
}

interface Props {
  scope: ObservableScope;
  membershipsWithTransport$: Behavior<
    Epoch<{ membership: CallMembership; transport?: LivekitTransport }[]>
  >;
  connectionManager: IConnectionManager;
}
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
}: Props): Behavior<Epoch<MatrixLivekitMember[]>> {
  /**
   * Stream of all the call members and their associated livekit data (if available).
   */

  return scope.behavior(
    combineLatest([
      membershipsWithTransport$,
      connectionManager.connectionManagerData$,
    ]).pipe(
      filter((values) =>
        values.every((value) => value.epoch === values[0].epoch),
      ),
      map(
        ([
          { value: membershipsWithTransports, epoch },
          { value: managerData },
        ]) =>
          new Epoch([membershipsWithTransports, managerData] as const, epoch),
      ),
      generateItemsWithEpoch(
        // Generator function.
        // creates an array of `{key, data}[]`
        // Each change in the keys (new key, missing key) will result in a call to the factory function.
        function* ([membershipsWithTransports, managerData]) {
          for (const { membership, transport } of membershipsWithTransports) {
            // TODO! cannot use membership.membershipID yet, Currently its hardcoded by the jwt service to
            const participantId = /*membership.membershipID*/ `${membership.userId}:${membership.deviceId}`;

            const participants = transport
              ? managerData.getParticipantForTransport(transport)
              : [];
            const participant =
              participants.find((p) => p.identity == participantId) ?? null;
            const connection = transport
              ? managerData.getConnectionForTransport(transport)
              : undefined;

            yield {
              keys: [participantId, membership.userId],
              data: { membership, participant, connection },
            };
          }
        },
        // Each update where the key of the generator array do not change will result in updates to the `data$` observable in the factory.
        (scope, data$, participantId, userId) => {
          logger.debug(
            `Updating data$ for participantId: ${participantId}, userId: ${userId}`,
          );
          // will only get called once per `participantId, userId` pair.
          // updates to data$ and as a result to displayName$ and mxcAvatarUrl$ are more frequent.
          return {
            participantId,
            userId,
            ...scope.splitBehavior(data$),
          };
        },
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
