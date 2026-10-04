/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalParticipant,
  type Participant,
  type Room as LivekitRoom,
} from "livekit-client";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, distinctUntilChanged, map } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { type Connection } from "./Connection";
import { type createMatrixMemberMetadata$ } from "./MatrixMemberMetadata";
import { type RemoteMatrixLivekitMember } from "./MatrixLivekitMembers";
import { type EncryptionSystem } from "../encryption";
import {
  type LocalRTCMember,
  type MemberMedia,
  type RemoteRTCMember,
  type RTCMember,
} from "../api";
import {
  createLivekitMemberMedia,
  createLocalLivekitMemberMedia,
} from "../media/LivekitMemberMedia";
import { mapScoped } from "../utils/mapScoped";
import { type LocalMembership } from "./LocalMember";
import { type TransportRegistry } from "./Transports";

export interface MemberContext {
  metadata: ReturnType<typeof createMatrixMemberMetadata$>;
  transports: TransportRegistry;
  encryptionSystem: EncryptionSystem;
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
  member: RemoteMatrixLivekitMember,
  context: MemberContext,
): RemoteRTCMember {
  return {
    ...createRTCMember(scope, member.membership$, context),
    local: false,
    media$: mediaFor(
      scope,
      member.participant.value$,
      member.connection$,
      (mediaScope, participant, room) =>
        createLivekitMemberMedia(
          mediaScope,
          participant,
          room,
          context.encryptionSystem,
        ),
    ),
  };
}

export function createLocalRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  localMembership: LocalMembership,
  context: MemberContext,
): LocalRTCMember {
  return {
    ...createRTCMember(scope, membership$, context),
    local: true,
    media$: mediaFor(
      scope,
      localMembership.participant$,
      localMembership.connection$,
      (mediaScope, participant, room) =>
        createLocalLivekitMemberMedia(
          mediaScope,
          participant,
          room,
          context.encryptionSystem,
          localMembership.setEnabled,
        ),
    ),
    sharingScreen$: localMembership.sharingScreen$,
    toggleScreenSharing: localMembership.toggleScreenSharing,
    screenShareError$: localMembership.screenShareError$,
    dismissScreenShareError: localMembership.dismissScreenShareError,
  };
}

function createRTCMember(
  scope: ObservableScope,
  membership$: Behavior<CallMembership>,
  { metadata, transports }: MemberContext,
): Omit<RTCMember, "local" | "media$"> {
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

/**
 * The member's media once its participant is known, in a scope that ends when
 * the participant or the connection changes.
 */
function mediaFor<
  P extends Participant | LocalParticipant,
  M extends MemberMedia,
>(
  scope: ObservableScope,
  participant$: Behavior<P | null>,
  connection$: Behavior<Connection | null>,
  factory: (scope: ObservableScope, participant: P, room: LivekitRoom) => M,
): Behavior<M | null> {
  const source$ = scope.behavior(
    combineLatest([participant$, connection$]).pipe(
      map(([participant, connection]) =>
        participant && connection
          ? { participant, room: connection.livekitRoom }
          : null,
      ),
      distinctUntilChanged(
        (a, b) => a?.participant === b?.participant && a?.room === b?.room,
      ),
    ),
  );
  return scope.behavior(
    mapScoped(scope, source$, (mediaScope, { participant, room }) =>
      factory(mediaScope, participant, room),
    ).pipe(map((media) => media ?? null)),
  );
}
