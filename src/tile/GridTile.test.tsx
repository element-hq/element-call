/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RemoteTrackPublication } from "livekit-client";
import { test, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";

import { GridTile } from "./GridTile";
import {
  mockRtcMembership,
  mockRemoteMedia,
  mockRemoteParticipant,
} from "../utils/test";
import { GridTileViewModel } from "../state/TileViewModel";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import { constant } from "../state/Behavior";
import {
  createRingingMedia,
  type RingingMediaViewModel,
} from "../state/media/RingingMediaViewModel";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;

const fakeRtcSession = {
  on: () => {},
  off: () => {},
  room: {
    on: () => {},
    off: () => {},
    client: {
      getUserId: () => null,
      getDeviceId: () => null,
      on: () => {},
      off: () => {},
    },
  },
  memberships: [],
} as unknown as MatrixRTCSession;

const callVm = {
  reactions$: constant({}),
  handsRaised$: constant({}),
} as Partial<CallViewModel> as CallViewModel;

test("GridTile is accessible", async () => {
  const vm = mockRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({
      setVolume() {},
      getTrackPublication: () =>
        ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    }),
  );

  const { container } = render(
    <ReactionsSenderProvider vm={callVm} rtcSession={fakeRtcSession}>
      <GridTile
        vm={new GridTileViewModel(constant(vm))}
        onOpenProfile={() => {}}
        targetWidth={300}
        targetHeight={200}
        showSpeakingIndicators
        showNameTags
        showRingingStatus
        showOutline
        focusable
      />
    </ReactionsSenderProvider>,
  );
  expect(await axe(container)).toHaveNoViolations();
  // Name should be visible
  screen.getByText("Alice");
});

test("GridTile displays ringing media", async () => {
  const pickupState$ = new BehaviorSubject<
    RingingMediaViewModel["pickupState$"]["value"]
  >("ringing");
  const vm = createRingingMedia({
    pickupState$,
    id: "test",
    intent: "audio",
    userId: "@alice:example.org",
    displayName$: constant("Alice"),
    mxcAvatarUrl$: constant(undefined),
  });

  const { container } = render(
    <ReactionsSenderProvider vm={callVm} rtcSession={fakeRtcSession}>
      <GridTile
        vm={new GridTileViewModel(constant(vm))}
        onOpenProfile={() => {}}
        targetWidth={300}
        targetHeight={200}
        showSpeakingIndicators
        showNameTags
        showRingingStatus
        showOutline
        focusable
      />
    </ReactionsSenderProvider>,
  );
  expect(await axe(container)).toHaveNoViolations();
  // Name and status should be visible
  screen.getByText("Alice");
  screen.getByText("Calling…");

  // Alice declines the call
  act(() => pickupState$.next("decline"));
  screen.getByText("Call ended");
});
