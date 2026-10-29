/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { BehaviorSubject, NEVER } from "rxjs";

import { type RTCMember, type TransportMetadata } from "../api";
import { type MemberMedia } from "../media-api";
import { constant } from "../reactive/Behavior";
import { ObservableScope } from "../reactive/ObservableScope";
import { type MediaBackend } from "./api";
import { combineBackends } from "./combineBackends";

function fakeBackend(type: string): MediaBackend & { ended: string[] } {
  const ended: string[] = [];
  return {
    ended,
    transportType: type,
    prepareLocalTransport: vi.fn(async () =>
      Promise.resolve({ canDelegateDelayedLeave: false }),
    ),
    delegateDelayedLeave: vi.fn(),
    local: {} as MediaBackend["local"],
    mediaFor: (scope, member): MemberMedia => {
      scope.onEnd(() => ended.push(member.memberId));
      return {
        tracks$: constant([{ id: `${type}:${member.memberId}` }] as never),
        encryptionError$: NEVER,
      };
    },
    connections$: constant([
      { transport: { type }, state: "connected" as never, resolved: undefined },
    ]),
    setAudioOutputDeviceId: vi.fn(),
    sendData: vi.fn(),
    data$: NEVER,
  };
}

function transport(type: string): TransportMetadata {
  return { type, id: type, raw: { type }, resolved$: constant(undefined) };
}

describe("combineBackends", () => {
  it("routes each member to the backend of its transport type", () => {
    const scope = new ObservableScope();
    const livekit = fakeBackend("livekit");
    const other = fakeBackend("other");
    const combined = combineBackends(scope, [livekit, other], "livekit");
    expect(combined.transportType).toBe("livekit");
    expect(combined.connections$.value).toHaveLength(2);

    const transport$ = new BehaviorSubject<TransportMetadata | undefined>(
      transport("other"),
    );
    const memberScope = new ObservableScope();
    const media = combined.mediaFor(memberScope, {
      memberId: "m1",
      transport$,
    } as unknown as RTCMember);
    expect(media.tracks$.value).toEqual([{ id: "other:m1" }]);

    transport$.next(transport("livekit"));
    expect(other.ended).toEqual(["m1"]);
    expect(media.tracks$.value).toEqual([{ id: "livekit:m1" }]);

    transport$.next(transport("unknown"));
    expect(media.tracks$.value).toBeNull();
    // The publishing backend keeps every member for as long as it is one
    expect(livekit.ended).toEqual([]);
    memberScope.end();
    expect(livekit.ended).toEqual(["m1"]);
    scope.end();
  });

  it("publishes on the backend of the publish type", () => {
    const scope = new ObservableScope();
    const livekit = fakeBackend("livekit");
    const other = fakeBackend("other");
    const combined = combineBackends(scope, [livekit, other], "other");
    expect(combined.transportType).toBe("other");
    expect(() => combineBackends(scope, [livekit, other], "unknown")).toThrow(
      "No media backend for transport unknown",
    );
    scope.end();
  });
});
