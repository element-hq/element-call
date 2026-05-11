/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import { testScope, mockMuteStates, mockMediaDevices } from "../utils/test";
import { constant } from "../state/Behavior";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import type { Layout } from "../state/layout-types";
import type { SpotlightTileViewModel } from "../state/TileViewModel";
import type { DeviceLabel } from "../state/MediaDevices";
import { createCallFooterViewModel } from "./CallFooterViewModel";

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

// Prevent supportsBackgroundProcessors from throwing in jsdom – it is not
// exercised by these tests (only used in `videoToggles`, not `videoOptions`).
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: (): boolean => false,
}));

/**
 * Returns the minimum set of CallViewModel fields required by
 * createCallFooterViewModel, with all other properties stubbed to
 * simple constant values.
 */
function buildMinimalCallViewModel(layout: Layout): CallViewModel {
  return {
    layout$: constant(layout),
    windowMode$: constant("normal"),
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
  } as unknown as CallViewModel;
}

/** A regular grid layout (not PiP). */
const gridLayout: Layout = {
  type: "grid",
  grid: [],
  setVisibleTiles: (): void => {},
};

/** A PiP layout – only the `type` matters for the tests. */
const pipLayout: Layout = {
  type: "pip",
  spotlight: {} as SpotlightTileViewModel,
};

const twoMicsAndOneCamMediaDevices = mockMediaDevices({
  audioInput: {
    available$: constant(
      new Map<string, DeviceLabel>([
        ["mic1", { type: "name", name: "Microphone 1" }],
        ["mic2", { type: "name", name: "Microphone 2" }],
      ]),
    ),
    selected$: constant(undefined),
    select: vi.fn(),
  },
  videoInput: {
    available$: constant(
      new Map<string, DeviceLabel>([
        ["cam1", { type: "name", name: "Camera 1" }],
      ]),
    ),
    selected$: constant(undefined),
    select: vi.fn(),
  },
});

describe("createCallFooterViewModel", () => {
  describe("audioOptions and videoOptions", () => {
    function checkEmptyFor(platform: string, layout: Layout): void {
      platformMock.mockReturnValue(platform);

      const vm = createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(layout),
        mockMuteStates(),
        twoMicsAndOneCamMediaDevices,
        /* openSettings */ undefined,
        /* reactionIdentifier */ undefined,
      );

      expect(vm.audioOptions$?.value).toEqual([]);
      expect(vm.videoOptions$?.value).toEqual([]);
    }
    it("are empty when both the platform is iOS", () => {
      checkEmptyFor("ios", gridLayout);
      it("are empty when both the layout is pip", () => {
        checkEmptyFor("desktop", pipLayout);
      });

      it("are populated when the platform is desktop and the layout is not PiP", () => {
        platformMock.mockReturnValue("desktop");

        const vm = createCallFooterViewModel(
          testScope(),
          buildMinimalCallViewModel(gridLayout),
          mockMuteStates(),
          twoMicsAndOneCamMediaDevices,
          /* openSettings */ undefined,
          /* reactionIdentifier */ undefined,
        );

        expect(vm.audioOptions$?.value).toEqual([
          { id: "mic1", label: "Microphone 1" },
          { id: "mic2", label: "Microphone 2" },
        ]);
        expect(vm.videoOptions$?.value).toEqual([
          { id: "cam1", label: "Camera 1" },
        ]);
      });
    });
  });
});
