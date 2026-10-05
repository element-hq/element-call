/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { distinctUntilChanged, map } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { type createMatrixMemberMetadata$ } from "./MatrixMemberMetadata";
import {
  type LocalRTCMember,
  type RemoteRTCMember,
  type RTCMember,
} from "../api";
import {
  type LocalMediaBackend,
  type MemberMediaFields,
} from "../media-backend/api";
import { type TransportRegistry } from "./Transports";

/** What every member is built from, besides its own membership and media. */
export interface MemberContext {
  metadata: ReturnType<typeof createMatrixMemberMetadata$>;
  transports: TransportRegistry;
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

export function createRemoteRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  media: MemberMediaFields,
  context: MemberContext,
): RemoteRTCMember {
  return {
    ...createRTCMember(scope, membership$, context),
    local: false,
    tracks$: media.tracks$,
    encryptionError$: media.encryptionError$,
  };
}

export function createLocalRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  local: Pick<
    LocalMediaBackend,
    "tracks$" | "encryptionError$" | "publish" | "unpublish"
  >,
  context: MemberContext,
): LocalRTCMember {
  return {
    ...createRTCMember(scope, membership$, context),
    local: true,
    tracks$: local.tracks$,
    encryptionError$: local.encryptionError$,
    publish: async (request) => local.publish(request),
    unpublish: async (id) => local.unpublish(id),
  };
}

function createRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  { metadata, transports }: MemberContext,
): Omit<RTCMember, "local" | "tracks$" | "encryptionError$"> {
  const { userId, deviceId, rtcBackendIdentity } = membership$.value;
  return {
    id: rtcBackendIdentity,
    userId,
    deviceId,
    membership$,
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
  };
}
