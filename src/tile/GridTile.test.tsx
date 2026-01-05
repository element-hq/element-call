/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RemoteTrackPublication } from "livekit-client";
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { GridTile } from "./GridTile";
import {
  mockRtcMembership,
  createRemoteMedia,
  mockRemoteParticipant,
} from "../utils/test";
import { GridTileViewModel } from "../state/TileViewModel";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import { constant } from "../state/Behavior";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;

test("GridTile is accessible", async () => {
  const vm = createRemoteMedia(
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
  const cVm = {
    reactions$: constant({}),
    handsRaised$: constant({}),
  } as Partial<CallViewModel> as CallViewModel;
  const { container } = render(
    <ReactionsSenderProvider vm={cVm} rtcSession={fakeRtcSession}>
      <GridTile
        vm={new GridTileViewModel(constant(vm))}
        onOpenProfile={() => {}}
        targetWidth={300}
        targetHeight={200}
        showSpeakingIndicators
        focusable={true}
      />
    </ReactionsSenderProvider>,
  );
  expect(await axe(container)).toHaveNoViolations();
  // Name should be visible
  screen.getByText("Alice");
});
