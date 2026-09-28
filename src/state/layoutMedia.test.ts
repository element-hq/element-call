/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { chooseSpotlightSpeaker, computeSpotlight } from "./layoutMedia";
import { type LocalUserMediaViewModel } from "./media/LocalUserMediaViewModel";
import { type RemoteUserMediaViewModel } from "./media/RemoteUserMediaViewModel";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel";
import { type ScreenShareViewModel } from "./media/ScreenShareViewModel";

// The layout functions only look at `type` and `local`, so stubs suffice
const local = { type: "user", local: true } as LocalUserMediaViewModel;
const alice = { type: "user", local: false } as RemoteUserMediaViewModel;
const bob = { type: "user", local: false } as RemoteUserMediaViewModel;
const carol = { type: "user", local: false } as RemoteUserMediaViewModel;
const screenShare = {
  type: "screen share",
  local: false,
} as ScreenShareViewModel;
const ringing = { type: "ringing" } as RingingMediaViewModel;

describe("chooseSpotlightSpeaker", () => {
  const items = (
    ...speaking: boolean[]
  ): {
    media: RemoteUserMediaViewModel | LocalUserMediaViewModel;
    speaking: boolean;
  }[] =>
    [local, alice, bob].map((media, i) => ({
      media,
      speaking: speaking[i] ?? false,
    }));

  it("prefers a remote speaker over the local user", () => {
    expect(chooseSpotlightSpeaker(undefined, items(true, false, true))).toBe(
      bob,
    );
  });

  it("falls back to any remote user, then the local user", () => {
    expect(chooseSpotlightSpeaker(undefined, items())).toBe(alice);
    expect(
      chooseSpotlightSpeaker(undefined, [{ media: local, speaking: false }]),
    ).toBe(local);
    expect(chooseSpotlightSpeaker(undefined, [])).toBeUndefined();
  });

  it("sticks with the previous speaker while they keep speaking", () => {
    expect(chooseSpotlightSpeaker(bob, items(false, true, true))).toBe(bob);
  });

  it("sticks with the previous speaker when nobody is speaking", () => {
    expect(chooseSpotlightSpeaker(bob, items())).toBe(bob);
  });

  it("switches when someone else speaks and the previous speaker is silent", () => {
    expect(chooseSpotlightSpeaker(bob, items(false, true, false))).toBe(alice);
  });

  it("forgets a previous speaker who left, and never sticks to the local user", () => {
    expect(chooseSpotlightSpeaker(carol, items())).toBe(alice);
    expect(chooseSpotlightSpeaker(local, items())).toBe(alice);
  });
});

describe("computeSpotlight", () => {
  it("spotlights ringing media with the local user in the PiP", () => {
    expect(
      computeSpotlight({
        ringing,
        screenShares: [screenShare],
        speaker: alice,
        localPip: local,
      }),
    ).toEqual({ spotlight: [ringing], pip: local });
  });

  it("spotlights screen shares with the speaker in the PiP", () => {
    expect(
      computeSpotlight({
        ringing: null,
        screenShares: [screenShare],
        speaker: alice,
        localPip: local,
      }),
    ).toEqual({ spotlight: [screenShare], pip: alice });
  });

  it("otherwise spotlights the speaker and hides a redundant PiP", () => {
    expect(
      computeSpotlight({
        ringing: null,
        screenShares: [],
        speaker: alice,
        localPip: local,
      }),
    ).toEqual({ spotlight: [alice], pip: local });
    expect(
      computeSpotlight({
        ringing: null,
        screenShares: [],
        speaker: local,
        localPip: local,
      }),
    ).toEqual({ spotlight: [local], pip: undefined });
  });
});
