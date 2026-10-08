/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import { distinctUntilChanged, map } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { type createMatrixMemberMetadata$ } from "./MatrixMemberMetadata";
import {
  type LocalRTCMember,
  type RemoteRTCMember,
  type RTCMember,
} from "../api";
import { type LocalMemberMedia, type MemberMedia } from "../media-api";
import { type TransportRegistry } from "./Transports";

/** What every member is built from, besides its own membership. */
export interface MemberContext {
  metadata: ReturnType<typeof createMatrixMemberMetadata$>;
  transports: TransportRegistry;
  /** Whose memberships are `local`. */
  own: { userId: string; deviceId: string };
}

/** Everything that tells one membership from another, for keying items. */
export function membershipKeys(
  membership: CallMembership,
): [string, string, string, string] {
  return [
    membership.userId,
    membership.deviceId,
    membership.memberId,
    membership.rtcBackendIdentity,
  ];
}

/** The slot's view of a membership: identity, room state and transport, no media. */
export function createRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  { metadata, transports, own }: MemberContext,
): RTCMember {
  const { userId, deviceId, memberId, rtcBackendIdentity } = membership$.value;
  return {
    local: userId === own.userId && deviceId === own.deviceId,
    // Read off the membership for now; the backend will derive it once the
    // identity scheme is its own and not the js-sdk's
    rtcBackendIdentity,
    userId,
    deviceId,
    memberId,
    displayName$: scope.behavior(
      metadata
        .createDisplayNameBehavior$(scope, userId)
        .pipe(map((name) => name ?? userId)),
    ),
    avatarUrl$: metadata.createAvatarUrlBehavior$(scope, userId),
    transport$: scope.behavior(
      membership$.pipe(
        map((membership) => membership.getTransport()),
        distinctUntilChanged(),
        map((transport) => transport && transports.get(transport)),
      ),
    ),
    applicationData$: scope.behavior(
      membership$.pipe(
        map((membership) => membership.applicationData),
        distinctUntilChanged(deepCompare),
      ),
    ),
  };
}

/** The participation's view of a remote member: the slot's member plus its media. */
export function createRemoteRTCMember(
  member: RTCMember,
  media: MemberMedia,
): RemoteRTCMember {
  return { ...member, local: false, ...media };
}

export function createLocalRTCMember(
  member: RTCMember,
  media: LocalMemberMedia,
): LocalRTCMember {
  return { ...member, local: true, ...media };
}
