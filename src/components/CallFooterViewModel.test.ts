/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { testScope, mockMuteStates, mockMediaDevices } from "../utils/test";
import { constant } from "../state/Behavior";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import type { Alignment, Layout } from "../state/layout-types";
import type { SpotlightTileViewModel } from "../state/TileViewModel";
import type { DeviceLabel } from "../state/MediaDevices";
import {
  createCallFooterViewModel,
  createLobbyFooterViewModel,
} from "./CallFooterViewModel";
import { HeaderStyle } from "../UrlParams";
import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import { shippedBackgrounds } from "../livekit/backgroundEffects";

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

// The SDK's own check needs WebGL and canvas APIs jsdom does not have.
const sdkSupportMock = vi.hoisted(() => vi.fn(() => false));
const modernRouteMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: (): boolean => sdkSupportMock(),
  supportsModernBackgroundProcessors: (): boolean => modernRouteMock(),
}));

const outputSelectionMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("livekit-client", () => ({
  supportsAudioOutputSelection: (): boolean => outputSelectionMock(),
}));

/**
 * Returns the minimum set of CallViewModel fields required by
 * createCallFooterViewModel, with all other properties stubbed to
 * simple constant values.
 */
function buildMinimalCallViewModel(layout: Layout): CallViewModel {
  return {
    layout$: constant(layout),
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
  spotlightAlignment$: new BehaviorSubject<Alignment>({
    inline: "end",
    block: "end",
  }),
  setVisibleTiles: (_: number) => {},
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
        ["mic1", { type: "number", number: 1 }],
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
  describe("selectAudioOutputOption", () => {
    function buildFooterVm(): ReturnType<typeof createCallFooterViewModel> {
      platformMock.mockReturnValue("desktop");
      return createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(gridLayout),
        mockMuteStates(),
        twoMicsAndOneCamMediaDevices,
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );
    }

    it("is withheld where the platform cannot route audio to a chosen device", () => {
      outputSelectionMock.mockReturnValue(false);
      expect(buildFooterVm().selectAudioOutputOption$.value).toBeUndefined();
    });

    it("is offered where the platform can route audio to a chosen device", () => {
      outputSelectionMock.mockReturnValue(true);
      expect(buildFooterVm().selectAudioOutputOption$.value).toBeDefined();
    });
  });

  describe("audioOutputOptions", () => {
    it("is an empty list, not absent, where the platform enumerates no outputs", () => {
      platformMock.mockReturnValue("desktop");
      outputSelectionMock.mockReturnValue(true);

      const vm = createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(gridLayout),
        mockMuteStates(),
        mockMediaDevices({
          audioInput: {
            available$: constant(
              new Map<string, DeviceLabel>([
                ["mic1", { type: "name", name: "Microphone 1" }],
              ]),
            ),
            selected$: constant(undefined),
            select: vi.fn(),
          },
          // As Safari: no outputs listed.
          audioOutput: {
            available$: constant(new Map<string, DeviceLabel>()),
            selected$: constant(undefined),
            select: vi.fn(),
          },
        }),
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );

      // Empty, not undefined: undefined would hide the section.
      expect(vm.audioOutputOptions$.value).toEqual([]);
    });
  });

  describe("audioOptions and videoOptions", () => {
    function checkEmptyFor(platform: string, layout: Layout): void {
      platformMock.mockReturnValue(platform);

      const vm = createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(layout),
        mockMuteStates(),
        twoMicsAndOneCamMediaDevices,
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );

      expect(vm.audioOptions$.value).toEqual([]);
      expect(vm.videoOptions$.value).toEqual([]);
    }
    it("are both empty when the platform is iOS", () => {
      checkEmptyFor("ios", gridLayout);
    });
    it("are both empty when the layout is pip", () => {
      checkEmptyFor("desktop", pipLayout);
    });

    it("are populated when the platform is desktop and the layout is not PiP", () => {
      platformMock.mockReturnValue("desktop");

      const vm = createCallFooterViewModel(
        testScope(),
        buildMinimalCallViewModel(gridLayout),
        mockMuteStates(),
        twoMicsAndOneCamMediaDevices,
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );

      expect(vm.audioOptions$?.value).toEqual([
        {
          id: "mic1",
          label: {
            number: 1,
            type: "number",
          },
        },
        {
          id: "mic2",
          label: {
            name: "Microphone 2",
            type: "name",
          },
        },
      ]);
      expect(vm.videoOptions$?.value).toEqual([
        {
          id: "cam1",
          label: {
            name: "Camera 1",
            type: "name",
          },
        },
      ]);
    });
  });

  describe("background effects", () => {
    afterEach(() => backgroundEffectSetting.setValue("none"));

    // The lobby, because in a call the whole device switcher is already
    // withheld on a phone, whatever the verdict says.
    function lobbyOn(
      platform: string,
    ): ReturnType<typeof createLobbyFooterViewModel> {
      platformMock.mockReturnValue(platform);
      return createLobbyFooterViewModel(
        testScope(),
        mockMuteStates(),
        twoMicsAndOneCamMediaDevices,
        /* openSettings */ undefined,
        /* hangup */ undefined,
        /* showLogo */ false,
      );
    }

    it("offers them on a phone whose browser can run them", () => {
      sdkSupportMock.mockReturnValue(true);
      expect(lobbyOn("ios").selectBackgroundEffect$.value).toBeDefined();
    });

    it("offers them where the pipeline will honour them", () => {
      sdkSupportMock.mockReturnValue(true);
      expect(lobbyOn("desktop").selectBackgroundEffect$.value).toBeDefined();
    });

    it("offers nothing where the browser itself cannot run them", () => {
      sdkSupportMock.mockReturnValue(false);
      expect(lobbyOn("desktop").selectBackgroundEffect$.value).toBeUndefined();
    });

    it("puts no effect in force where the browser cannot run them", () => {
      backgroundEffectSetting.setValue("blur");
      sdkSupportMock.mockReturnValue(false);
      expect(lobbyOn("desktop").backgroundEffect$.value).toBe("none");
      sdkSupportMock.mockReturnValue(true);
      expect(lobbyOn("desktop").backgroundEffect$.value).toBe("blur");
    });

    it("stores the effect chosen", () => {
      sdkSupportMock.mockReturnValue(true);
      const vm = lobbyOn("desktop");
      vm.selectBackgroundEffect$.value?.("image:arc");
      expect(vm.backgroundEffect$.value).toBe("image:arc");
      // What isn't an effect on offer is stored as none.
      vm.selectBackgroundEffect$.value?.("image:gone");
      expect(backgroundEffectSetting.getValue()).toBe("none");
    });

    it("says they run slowly where only the slower route exists", () => {
      sdkSupportMock.mockReturnValue(true);
      modernRouteMock.mockReturnValue(false);
      const slow = lobbyOn("desktop");
      expect(slow.backgroundEffectNotice$.value).toBe("slow");
      expect(slow.selectBackgroundEffect$.value).toBeDefined();
      modernRouteMock.mockReturnValue(true);
      expect(lobbyOn("desktop").backgroundEffectNotice$.value).toBeUndefined();
    });

    it("offers every effect in order", () => {
      sdkSupportMock.mockReturnValue(true);
      expect(lobbyOn("desktop").backgroundEffects$.value).toEqual([
        { id: "none", kind: "none" },
        { id: "blur", kind: "blur" },
        ...shippedBackgrounds.map((background) => ({
          id: `image:${background.id}`,
          kind: "image",
          imageUrl: background.imagePath,
        })),
      ]);
    });

    it("says they are unavailable where they cannot be chosen", () => {
      sdkSupportMock.mockReturnValue(false);
      expect(lobbyOn("desktop").backgroundEffectNotice$.value).toBe(
        "unavailable",
      );
    });

    it("availability is the same before and during a call", () => {
      for (const supported of [true, false]) {
        sdkSupportMock.mockReturnValue(supported);
        const lobby = lobbyOn("desktop");
        const inCall = createCallFooterViewModel(
          testScope(),
          buildMinimalCallViewModel(gridLayout),
          mockMuteStates(),
          twoMicsAndOneCamMediaDevices,
          /* reactionIdentifier */ undefined,
          { showControls: true, header: HeaderStyle.Standard },
        );
        const offeredInLobby =
          lobby.selectBackgroundEffect$.value !== undefined;
        expect(inCall.selectBackgroundEffect$.value !== undefined).toBe(
          offeredInLobby,
        );
        expect(offeredInLobby).toBe(supported);
      }
    });
  });
});
