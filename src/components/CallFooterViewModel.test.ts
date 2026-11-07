/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import {
  testScope,
  mockMuteStates,
  mockMediaDevices,
  mockVideoTrack,
} from "../utils/test";
import { constant } from "../state/Behavior";
import { type BackgroundEffectsState } from "../state/BackgroundEffects";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import type { Layout } from "../state/layout-types";
import type { SpotlightTileViewModel } from "../state/TileViewModel";
import type { DeviceLabel } from "../state/MediaDevices";
import {
  createCallFooterViewModel,
  createLobbyFooterViewModel,
} from "./CallFooterViewModel";
import { HeaderStyle } from "../UrlParams";

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

/**
 * Returns the minimum set of CallViewModel fields required by
 * createCallFooterViewModel, with all other properties stubbed to
 * simple constant values.
 */
function buildMinimalCallViewModel(layout: Layout): CallViewModel {
  return {
    layout$: constant(layout),
    camera$: constant(undefined),
    edgeToEdge$: constant(false),
    showHeader$: constant(false),
    hangup: (): void => {},
    gridMode$: constant("grid"),
    setGridMode: (): void => {},
    sharingScreen$: constant(false),
    toggleScreenSharing: null,
    audioOutputSwitcher$: constant(null),
    handsRaised$: constant({}),
    reactions$: constant({}),
    tileStoreGeneration$: constant(0),
    showFooter$: constant(true),
    showModals$: constant(true),
    settingsOpen$: constant(false),
    setSettingsOpen$: constant(() => {}),
  } as unknown as CallViewModel;
}

/** A regular grid layout (not PiP). */
const gridLayout: Layout = {
  type: "grid",
  grid: [],
  setVisibleTiles: (_: number) => {},
};

/** A PiP layout – only the `type` matters for the tests. */
const pipLayout: Layout = {
  type: "pip",
  spotlight: {} as SpotlightTileViewModel,
};

const pipeline = constant<BackgroundEffectsState>({
  supported: true,
  processor: undefined,
});

const oneOfEach = {
  available$: constant(
    new Map<string, DeviceLabel>([["1", { type: "number", number: 1 }]]),
  ),
  selected$: constant(undefined),
  select: vi.fn(),
};
const devices = mockMediaDevices({
  audioInput: oneOfEach,
  videoInput: oneOfEach,
});

describe("createCallFooterViewModel", () => {
  it.each([
    ["desktop", "grid", true, gridLayout],
    ["ios", "grid", false, gridLayout],
    ["desktop", "pip", false, pipLayout],
  ] as const)(
    "on %s in a %s layout, offers the device menus: %s",
    (platform, _, offered, layout) => {
      platformMock.mockReturnValue(platform);
      const vm = createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(layout),
        mockMuteStates(),
        devices,
        pipeline,
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );
      const audio = vm.audioMenuVm$.value;
      const camera = vm.cameraMenuVm$.value;
      expect(audio.options$.value.length > 0).toBe(offered);
      expect(camera.options$.value.length > 0).toBe(offered);
      expect(camera.selectBackgroundEffect$.value !== undefined).toBe(offered);
    },
  );

  it("previews the call's camera", () => {
    const track = mockVideoTrack({});
    const vm = createCallFooterViewModel(
      testScope(),
      { ...buildMinimalCallViewModel(gridLayout), camera$: constant(track) },
      mockMuteStates(),
      devices,
      pipeline,
      /* reactionIdentifier */ undefined,
      { showControls: true, header: HeaderStyle.Standard },
    );
    expect(vm.cameraMenuVm$.value.cameraTrack$.value).toBe(track);
  });
});

describe("createLobbyFooterViewModel", () => {
  it("offers the device menus even on a phone, previewing the lobby's camera", () => {
    platformMock.mockReturnValue("ios");
    const track = mockVideoTrack({});
    const vm = createLobbyFooterViewModel(
      testScope(),
      mockMuteStates(),
      devices,
      pipeline,
      constant(track),
      /* openSettings */ undefined,
      /* hangup */ undefined,
      /* showLogo */ false,
    );
    const camera = vm.cameraMenuVm$.value;
    expect(vm.audioMenuVm$.value.options$.value).not.toEqual([]);
    expect(camera.options$.value).not.toEqual([]);
    expect(camera.selectBackgroundEffect$.value).toBeDefined();
    expect(camera.cameraTrack$.value).toBe(track);
  });
});
