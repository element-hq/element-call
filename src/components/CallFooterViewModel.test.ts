/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
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

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

// The SDK's own check needs WebGL and canvas APIs jsdom does not have. The
// tests below drive it directly, because what they are about is the answer the
// app gives on top of it.
const sdkSupportMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: (): boolean => sdkSupportMock(),
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
      // Undefined is what renders the speaker section disabled.
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
          // Safari enumerates no output devices whatsoever. Reproduced by the
          // condition rather than by the browser, so it is checked on the
          // Linux CI runners that have no Safari to check it with.
          audioOutput: {
            available$: constant(new Map<string, DeviceLabel>()),
            selected$: constant(undefined),
            select: vi.fn(),
          },
        }),
        /* reactionIdentifier */ undefined,
        { showControls: true, header: HeaderStyle.Standard },
      );

      // Empty rather than undefined: undefined means this menu has no notion
      // of outputs at all, as the camera menu has none, and hides the section.
      // Empty means there are none to list, and the menu still shows the
      // section with a default in it, disabled.
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
    // The lobby, deliberately: in a call the whole switcher is already
    // withheld on a phone, so a check there passes whatever the verdict says.
    // The lobby keeps its switcher, which is where a phone browser was offered
    // every effect, given none of them, and told nothing.
    function lobbyFor(
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

    it("offers nothing the pipeline would refuse to honour", () => {
      sdkSupportMock.mockReturnValue(true);
      const vm = lobbyFor("ios");

      expect(vm.selectBackgroundEffect$.value).toBeUndefined();
      expect(vm.toggleBlur$.value).toBeUndefined();
    });

    it("offers them where the pipeline will honour them", () => {
      sdkSupportMock.mockReturnValue(true);
      const vm = lobbyFor("desktop");

      expect(vm.selectBackgroundEffect$.value).toBeDefined();
      expect(vm.toggleBlur$.value).toBeDefined();
    });

    it("offers nothing where the browser itself cannot run them", () => {
      sdkSupportMock.mockReturnValue(false);
      const vm = lobbyFor("desktop");

      expect(vm.selectBackgroundEffect$.value).toBeUndefined();
      expect(vm.toggleBlur$.value).toBeUndefined();
    });

    it("availability is the same before and during a call", () => {
      for (const supported of [true, false]) {
        sdkSupportMock.mockReturnValue(supported);
        platformMock.mockReturnValue("desktop");
        const inCall = createCallFooterViewModel(
          testScope(),
          buildMinimalCallViewModel(gridLayout),
          mockMuteStates(),
          twoMicsAndOneCamMediaDevices,
          /* reactionIdentifier */ undefined,
          { showControls: true, header: HeaderStyle.Standard },
        );
        const lobby = lobbyFor("desktop");

        const offeredInCall =
          inCall.selectBackgroundEffect$.value !== undefined;
        const offeredInLobby =
          lobby.selectBackgroundEffect$.value !== undefined;
        expect(offeredInLobby).toBe(offeredInCall);
        expect(offeredInLobby).toBe(supported);
      }
    });
  });
});
