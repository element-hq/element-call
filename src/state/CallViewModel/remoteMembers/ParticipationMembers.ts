/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior";
import { Epoch, type ObservableScope } from "../../ObservableScope";
import { generateItemsWithEpoch } from "../../../utils/observable";
import { type FfiMembership } from "../../../matrix-rtc-sdk";
import { type IConnectionManager } from "./ConnectionManager";
import {
  type CallMember,
  type RemoteMatrixLivekitMember,
} from "./MatrixLivekitMembers";

/** What this module needs from a {@link RtcParticipationManager}. */
export interface ParticipationRoster {
  memberships$: Behavior<Epoch<FfiMembership[]>>;
  ownMemberId$: Behavior<string | null>;
}

/**
 * The crate's membership as a tile sees it. `deviceId` falls back to the
 * member id so that `${userId}:${deviceId}` is the member's media id
 * (`memberMediaId` in `src/state/rtc/mediaId.ts`).
 */
export function callMemberOf(membership: FfiMembership): CallMember {
  const { member } = membership;
  return {
    userId: member.userId,
    deviceId: member.deviceId ?? member.memberId,
    memberId: member.memberId,
    rtcBackendIdentity: membership.transportIdentity,
  };
}

interface Props {
  scope: ObservableScope;
  rtcParticipationManager: ParticipationRoster;
  connectionManager: IConnectionManager;
}

/**
 * The remote members of the call with their LiveKit side: the connection to
 * the transport they publish on and, once they are on it, their participant
 * — matched by the transport identity the crate derived for them.
 */
export function createParticipationRemoteMembers$({
  scope,
  rtcParticipationManager,
  connectionManager,
}: Props): Behavior<Epoch<RemoteMatrixLivekitMember[]>> {
  return scope.behavior(
    combineLatest([
      rtcParticipationManager.memberships$,
      rtcParticipationManager.ownMemberId$,
      connectionManager.connectionManagerData$,
    ]).pipe(
      map(
        ([memberships, ownMemberId, data]) =>
          new Epoch(
            [memberships.value, ownMemberId, data.value] as const,
            memberships.epoch,
          ),
      ),
      generateItemsWithEpoch(
        "ParticipationRemoteMembers",
        function* ([memberships, ownMemberId, managerData]) {
          for (const membership of memberships) {
            const { member, transportIdentity } = membership;
            if (member.memberId === ownMemberId) continue;

            // The crate lists the services a member publishes on; today a
            // member publishes on at most one.
            const serviceUrl = membership.connections[0];
            const transport =
              serviceUrl === undefined
                ? null
                : { type: "livekit" as const, livekit_service_url: serviceUrl };
            const participants = transport
              ? managerData.getParticipantsForTransport(transport)
              : [];
            const matches = participants.filter(
              (p) => p.identity === transportIdentity,
            );
            const participant = matches[0] ?? null;
            const connection = transport
              ? managerData.getConnectionForTransport(transport)
              : null;
            if (matches.length > 1)
              logger.warn(
                `[ParticipationRemoteMembers] ${transportIdentity}: ${matches.length} LiveKit participants match (sids ${matches.map((p) => p.sid).join(", ")}), using ${participant?.sid}`,
              );

            yield {
              // The member id is the key; the rest is there for the logs.
              keys: [
                member.memberId,
                member.userId,
                member.deviceId ?? "",
                transportIdentity ?? "",
              ],
              data: {
                membership: callMemberOf(membership),
                participant,
                connection,
              },
            };
          }
        },
        (scope, data$, _memberId, userId, _deviceId, rtcBackendIdentity) => {
          const { participant$, ...rest } = scope.splitBehavior(data$);
          // Log whether the member could be matched to a LiveKit participant,
          // since a tile shows "waiting for media" for as long as it cannot.
          participant$.pipe(scope.bind()).subscribe((p) => {
            const url = data$.value.connection?.transport.livekit_service_url;
            logger.info(
              `[ParticipationRemoteMembers] ${rtcBackendIdentity}: LiveKit participant ${p ? `matched (${p.sid})` : "missing"} on ${url ?? "no connection"}`,
            );
          });
          return {
            userId,
            participant: { type: "remote" as const, value$: participant$ },
            ...rest,
          };
        },
      ),
    ),
    new Epoch([], -1),
  );
}
