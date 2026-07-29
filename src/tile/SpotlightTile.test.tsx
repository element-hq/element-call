/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect, vi } from "vitest";
import { act, isInaccessible, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { BehaviorSubject } from "rxjs";
import { type RemoteTrackPublication } from "livekit-client";

import { SpotlightTile } from "./SpotlightTile";
import {
  mockLocalParticipant,
  mockMediaDevices,
  mockRtcMembership,
  mockLocalMedia,
  mockRemoteMedia,
  mockRemoteParticipant,
  mockRemoteScreenShare,
} from "../utils/test";
import { SpotlightTileViewModel } from "../state/TileViewModel";
import { constant } from "../state/Behavior";
import {
  createRingingMedia,
  type RingingMediaViewModel,
} from "../state/media/RingingMediaViewModel";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
} as unknown as typeof IntersectionObserver;

test("SpotlightTile is accessible", async () => {
  const vm1 = mockRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({}),
  );

  const vm2 = mockLocalMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    {
      rawDisplayName: "Bob",
      getMxcAvatarUrl: () => "mxc://dlskf",
    },
    mockLocalParticipant({}),
    mockMediaDevices({}),
  );

  const user = userEvent.setup();
  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([vm1, vm2]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable={true}
    />,
  );

  expect(await axe(container)).toHaveNoViolations();
  // Each name appears both in the item's name tag and in its indicator
  // button; the name tag comes first in the DOM
  const [aliceNameTag] = screen.getAllByText("Alice");
  const [bobNameTag] = screen.getAllByText("Bob");
  // Alice should be in the spotlight, with her name and avatar on the
  // first page
  expect(isInaccessible(aliceNameTag)).toBe(false);
  const aliceAvatar = screen.getByRole("img");
  expect(screen.queryByRole("button", { name: "common.back" })).toBe(null);
  // Bob should be out of the spotlight, and therefore invisible
  expect(isInaccessible(bobNameTag)).toBe(true);
  // Now navigate to Bob
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(isInaccessible(bobNameTag)).toBe(false);
  expect(screen.getByRole("img")).not.toBe(aliceAvatar);
  expect(isInaccessible(aliceNameTag)).toBe(true);
  // Clicking Alice's indicator button brings her back into the spotlight
  await user.click(screen.getByRole("button", { name: "Alice" }));
  expect(isInaccessible(aliceNameTag)).toBe(false);
  expect(isInaccessible(bobNameTag)).toBe(true);
  // Can toggle whether the tile is expanded
  await user.click(screen.getByRole("button", { name: "Expand" }));
  expect(toggleExpanded).toHaveBeenCalled();
});

test("screen share indicator is labeled with the sharer's name", async () => {
  const userVm = mockRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({}),
  );
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({}),
  );

  const user = userEvent.setup();
  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([userVm, screenShareVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  const [userNameTag, screenShareNameTag] = screen.getAllByText("Alice");
  expect(isInaccessible(screenShareNameTag)).toBe(true);
  const indicator = screen.getByRole("button", {
    name: "Alice's screen share",
  });
  const scrollIntoView = vi.spyOn(indicator, "scrollIntoView");
  await user.click(indicator);
  expect(isInaccessible(screenShareNameTag)).toBe(false);
  expect(isInaccessible(userNameTag)).toBe(true);
  expect(scrollIntoView).toHaveBeenCalledWith({
    block: "nearest",
    inline: "nearest",
  });
});

test("screen share indicators preview the shared screen", () => {
  const userVm = mockRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([userVm, screenShareVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  const [userIndicator, screenShareIndicator] = screen.getAllByTestId(
    "spotlight-indicator",
  );
  expect(userIndicator).toHaveAttribute("data-type", "user");
  expect(screenShareIndicator).toHaveAttribute("data-type", "screen share");
  expect(screen.getAllByTestId("spotlight-indicator-preview")).toHaveLength(1);
  expect(screenShareIndicator).toContainElement(
    screen.getByTestId("spotlight-indicator-preview"),
  );
  expect(screenShareIndicator.lastElementChild).toHaveTextContent("Alice");
  expect(screenShareIndicator.lastElementChild).not.toHaveTextContent(
    "screen share",
  );
});

test("screen share preview uses the published aspect ratio", () => {
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({
      getTrackPublication: () =>
        ({
          dimensions: { width: 3440, height: 1440 },
        }) as RemoteTrackPublication,
    }),
  );
  const userVm = mockRemoteMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([screenShareVm, userVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(
    screen.getByTestId("spotlight-indicator-preview").parentElement,
  ).toHaveStyle({ aspectRatio: 3440 / 1440 });
});

test("screen share indicator falls back to an icon without a video track", () => {
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({ getTrackPublication: () => undefined }),
  );
  const userVm = mockRemoteMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([screenShareVm, userVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(screen.queryByTestId("spotlight-indicator-preview")).toBe(null);
  expect(
    screen.getByRole("button", { name: "Alice's screen share" }),
  ).toBeInTheDocument();
});

test("screen share indicator hides the preview while disconnected", () => {
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );
  const userVm = mockRemoteMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );
  vi.spyOn(screenShareVm, "videoEnabled$", "get").mockReturnValue(
    constant(false),
  );

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([screenShareVm, userVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(screen.queryByTestId("spotlight-indicator-preview")).toBe(null);
});

test("screen share indicator does not attach a hidden preview", () => {
  const screenShareVm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );
  const userVm = mockRemoteMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([screenShareVm, userVm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators={false}
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(screen.getAllByTestId("spotlight-indicator")).toHaveLength(2);
  expect(screen.queryByTestId("spotlight-indicator-preview")).toBe(null);
});

test("off-screen screen shares hide their full-size video", () => {
  const screenShareA = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );
  const screenShareB = mockRemoteScreenShare(
    mockRtcMembership("@bob:example.org", "BBBB"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );
  vi.spyOn(screenShareB, "id", "get").mockReturnValue("screenshare-b");

  render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([screenShareA, screenShareB]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={vi.fn()}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  // Hiding the off-screen element gives it zero dimensions, so the thumbnail
  // drives LiveKit's adaptive stream quality.
  const [itemA, itemB] = screen.getAllByTestId("videoTile");
  expect(itemA).toHaveAttribute("data-video-enabled", "true");
  expect(itemB).toHaveAttribute("data-video-enabled", "false");
});

test("Screen share volume UI is shown when screen share has audio", async () => {
  const vm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {},
    mockRemoteParticipant({}),
  );

  vi.spyOn(vm, "audioEnabled$", "get").mockReturnValue(constant(true));

  const toggleExpanded = vi.fn();
  const { container } = render(
    <TooltipProvider>
      <SpotlightTile
        vm={
          new SpotlightTileViewModel(
            constant([vm]),
            constant(false),
            constant("solid"),
          )
        }
        targetWidth={300}
        targetHeight={200}
        expanded={false}
        onToggleExpanded={toggleExpanded}
        showIndicators
        showNameTags
        showRingingStatus
        focusable
      />
    </TooltipProvider>,
  );

  expect(await axe(container)).toHaveNoViolations();

  // Volume menu button should exist
  expect(screen.queryByRole("button", { name: /volume/i })).toBeInTheDocument();
});

test("Screen share volume UI is hidden when screen share has no audio", async () => {
  const vm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {},
    mockRemoteParticipant({}),
  );

  vi.spyOn(vm, "audioEnabled$", "get").mockReturnValue(constant(false));

  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([vm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(await axe(container)).toHaveNoViolations();

  // Volume menu button should not exist
  expect(
    screen.queryByRole("button", { name: /volume/i }),
  ).not.toBeInTheDocument();
});

test("SpotlightTile displays ringing media", async () => {
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

  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          constant([vm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable={true}
    />,
  );

  expect(await axe(container)).toHaveNoViolations();
  // Alice should be in the spotlight with the right status
  screen.getByText("Alice");
  screen.getByText("Calling…");

  // Now we time out ringing to Alice
  act(() => pickupState$.next("timeout"));
  screen.getByText("Call ended");
});
