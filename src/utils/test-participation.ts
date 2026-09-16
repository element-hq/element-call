/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import {
  FfiDeviceAttribution,
  FfiMembershipState,
  type FfiConnectionWithMembers,
  type FfiMediaKey,
  type FfiMember,
  type FfiMembership,
} from "../matrix-rtc-sdk";
import { Epoch } from "../state/ObservableScope";

/**
 * Hand-made values of the crate's records, for the modules that consume a
 * `CallParticipation`'s behaviors without needing the crate itself.
 */

export function fakeMember(overrides: Partial<FfiMember> = {}): FfiMember {
  const memberId = overrides.memberId ?? "m-peer";
  return {
    memberId,
    userId: "@peer:example.org",
    deviceId: "PEERDEV",
    deviceAttribution: FfiDeviceAttribution.Verified,
    eventId: `$${memberId}`,
    publishedTransports: [],
    canSubscribe: ["livekit"],
    ...overrides,
  };
}

export function fakeMembership(
  overrides: Partial<Omit<FfiMembership, "member">> & {
    member?: Partial<FfiMember>;
  } = {},
): FfiMembership {
  const { member, ...rest } = overrides;
  return {
    member: fakeMember(member),
    state: FfiMembershipState.Joined,
    connections: [],
    ...rest,
  };
}

export function fakeConnection(
  overrides: Partial<FfiConnectionWithMembers["connection"]> & {
    members?: FfiMember[];
  } = {},
): FfiConnectionWithMembers {
  const { members = [], ...connection } = overrides;
  const serviceUrl = connection.serviceUrl ?? "https://lk.example.org";
  return {
    connection: {
      serviceUrl,
      wsUrl: serviceUrl.replace("https", "wss"),
      jwtToken: "jwt",
      ...connection,
    },
    members,
  };
}

export function fakeMediaKey(
  overrides: Partial<FfiMediaKey> = {},
): FfiMediaKey {
  return {
    memberId: "m-peer",
    key: new Uint8Array(32).fill(7).buffer,
    index: 0,
    creationTsMs: 0n,
    ...overrides,
  };
}

/**
 * The behaviors of a `CallParticipation`, as subjects a test drives by hand.
 * Modules take structural slices of the participation, so this stands in for
 * it wherever the crate is not what is under test.
 */
export class FakeParticipation {
  public readonly memberships$ = new BehaviorSubject(
    new Epoch<FfiMembership[]>([], 0),
  );
  public readonly connections$ = new BehaviorSubject<
    FfiConnectionWithMembers[]
  >([]);
  public readonly keyMap$ = new BehaviorSubject<FfiMediaKey[]>([]);
  public readonly ownMemberId$ = new BehaviorSubject<string | null>(null);
  public readonly ownTransportIdentity$ = new BehaviorSubject<string | null>(
    null,
  );
  public readonly ownMembership$ = new BehaviorSubject<FfiMembership | null>(
    null,
  );

  /** Replace the roster, advancing the epoch as the real thing does. */
  public setMemberships(memberships: FfiMembership[]): void {
    this.memberships$.next(
      new Epoch(memberships, this.memberships$.value.epoch + 1),
    );
  }
}
