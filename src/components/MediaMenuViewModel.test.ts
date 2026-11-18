/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, type Observable } from "rxjs";
import { type LocalVideoMediaTrack } from "@element-hq/matrixrtc-sdk";

import {
  flushPromises,
  testScope,
  mockMuteStates,
  mockMediaDevices,
  mockVideoTrack,
} from "../utils/test";
import { constant } from "../state/Behavior";
import { type BackgroundEffectsState } from "../state/BackgroundEffects";
import type { DeviceLabel } from "../state/MediaDevices";
import {
  createAudioMenuViewModel,
  createCameraMenuViewModel,
  type AudioMenuViewModel,
  type CameraMenuViewModel,
} from "./MediaMenuViewModel";
import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import { shippedBackgrounds } from "../tracks/backgroundEffectCatalog";
import type * as BackgroundImages from "../tracks/backgroundImages";
import {
  type AddedBackground,
  addedBackgrounds,
  maxAddedBackgrounds,
  UnusableImage,
} from "../tracks/backgroundImages";

const modernRouteMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("@livekit/track-processors", () => ({
  supportsModernBackgroundProcessors: (): boolean => modernRouteMock(),
}));

const outputSelectionMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("livekit-client", () => ({
  supportsAudioOutputSelection: (): boolean => outputSelectionMock(),
}));

const store = vi.hoisted(() => ({
  add: vi.fn<(file: Blob) => Promise<string>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
}));
vi.mock("../tracks/backgroundImages", async (original) => {
  const { BehaviorSubject } = await import("rxjs");
  return {
    ...(await original<typeof BackgroundImages>()),
    addedBackgrounds: {
      added$: new BehaviorSubject<AddedBackground[] | undefined>([]),
      add: store.add,
      remove: store.remove,
    },
  };
});

const added$ = addedBackgrounds.added$ as BehaviorSubject<
  AddedBackground[] | undefined
>;

const devices = mockMediaDevices({
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
  // As Safari: no outputs listed.
  audioOutput: {
    available$: constant(new Map<string, DeviceLabel>()),
    selected$: constant(undefined),
    select: vi.fn(),
  },
});

function audioMenu(disableSwitcher = false): AudioMenuViewModel {
  return createAudioMenuViewModel(
    testScope(),
    mockMuteStates(),
    devices,
    constant(disableSwitcher),
  );
}

function cameraMenu({
  supported = true,
  disableSwitcher = false,
  pipeline$ = constant({ supported, processor: undefined }),
  camera$ = constant(null),
}: {
  supported?: boolean;
  disableSwitcher?: boolean;
  pipeline$?: Observable<BackgroundEffectsState>;
  camera$?: Observable<LocalVideoMediaTrack | null>;
} = {}): CameraMenuViewModel {
  return createCameraMenuViewModel(
    testScope(),
    mockMuteStates(),
    devices,
    constant(disableSwitcher),
    pipeline$,
    camera$,
  );
}

describe("createAudioMenuViewModel", () => {
  it("lists the devices, unless the switcher is withheld", () => {
    expect(audioMenu().options$.value).toEqual([
      { id: "mic1", label: { type: "number", number: 1 } },
      { id: "mic2", label: { type: "name", name: "Microphone 2" } },
    ]);
    expect(audioMenu(true).options$.value).toEqual([]);
  });

  it("lists no outputs as an empty list, which keeps the section", () => {
    expect(audioMenu().output.options$.value).toEqual([]);
  });

  it.each([true, false])(
    "offers to pick an output only where the platform can route to it (%s)",
    (canRoute) => {
      outputSelectionMock.mockReturnValue(canRoute);
      expect(audioMenu().output.select$.value !== undefined).toBe(canRoute);
    },
  );
});

describe("createCameraMenuViewModel", () => {
  afterEach(() => {
    backgroundEffectSetting.setValue("none");
    added$.next([]);
  });

  it("offers effects where they run, saying where they run slowly", () => {
    modernRouteMock.mockReturnValue(true);
    const vm = cameraMenu();
    expect(vm.backgroundEffects.select$.value).toBeDefined();
    expect(vm.backgroundEffects.addImage$.value).toBeDefined();
    expect(vm.backgroundEffects.notice$.value).toBeUndefined();

    modernRouteMock.mockReturnValue(false);
    const slow = cameraMenu();
    expect(slow.backgroundEffects.select$.value).toBeDefined();
    expect(slow.backgroundEffects.notice$.value).toBe("slow");
    modernRouteMock.mockReturnValue(true);
  });

  it("offers nothing while the switcher is withheld", () => {
    const vm = cameraMenu({ disableSwitcher: true });
    expect(vm.options$.value).toEqual([]);
    expect(vm.backgroundEffects.select$.value).toBeUndefined();
    expect(vm.backgroundEffects.notice$.value).toBe("unavailable");
  });

  it("offers nothing once the pipeline fails to build, keeping the choice", () => {
    backgroundEffectSetting.setValue("blur");
    const pipeline$ = new BehaviorSubject<BackgroundEffectsState>({
      supported: true,
      processor: undefined,
    });
    const vm = cameraMenu({ pipeline$ });
    expect(vm.backgroundEffects.selected$.value).toBe("blur");

    pipeline$.next({ supported: false, processor: undefined });
    expect(vm.backgroundEffects.select$.value).toBeUndefined();
    expect(vm.backgroundEffects.addImage$.value).toBeUndefined();
    expect(vm.backgroundEffects.remove$.value).toBeUndefined();
    expect(vm.backgroundEffects.notice$.value).toBe("unavailable");
    expect(vm.backgroundEffects.selected$.value).toBe("none");
    expect(backgroundEffectSetting.getValue()).toBe("blur");
  });

  it("saves the effect chosen, and none for one not on offer", () => {
    const vm = cameraMenu();
    vm.backgroundEffects.select$.value!("image:arc");
    expect(vm.backgroundEffects.selected$.value).toBe("image:arc");
    vm.backgroundEffects.select$.value!("image:gone");
    expect(backgroundEffectSetting.getValue()).toBe("none");
  });

  it("offers every effect in order, the added ones removable", () => {
    added$.next([{ id: "mine", url: "blob:mine" }]);
    expect(cameraMenu().backgroundEffects.available$.value).toEqual([
      { id: "none", kind: "none", removable: false },
      { id: "blur", kind: "blur", removable: false },
      ...shippedBackgrounds.map((background) => ({
        id: `image:${background.id}`,
        kind: "image",
        imageUrl: background.imagePath,
        removable: false,
      })),
      {
        id: "added:mine",
        kind: "image",
        imageUrl: "blob:mine",
        removable: true,
      },
    ]);
  });

  it("passes on the wait for the first effect", () => {
    const pipeline$ = new BehaviorSubject<BackgroundEffectsState>({
      supported: true,
      processor: undefined,
      wait: "settling",
    });
    const vm = cameraMenu({ pipeline$ });
    expect(vm.backgroundEffects.settling$.value).toBe(true);
    pipeline$.next({ ...pipeline$.value, wait: undefined });
    expect(vm.backgroundEffects.settling$.value).toBe(false);
  });

  it("offers adding only below the limit", () => {
    const vm = cameraMenu();
    added$.next(
      Array.from({ length: maxAddedBackgrounds }, (_, i) => ({
        id: `${i}`,
        url: `blob:${i}`,
      })),
    );
    expect(vm.backgroundEffects.addImage$.value).toBeUndefined();
    added$.next(added$.value!.slice(1));
    expect(vm.backgroundEffects.addImage$.value).toBeDefined();
  });

  it("says why each refused file was refused", async () => {
    const vm = cameraMenu();
    store.add.mockRejectedValue(new UnusableImage("animated"));
    vm.backgroundEffects.addImage$.value!(new File(["x"], "a.gif"));
    await flushPromises();
    const first = vm.backgroundEffects.imageRefusal$.value;
    expect(first).toEqual({ reason: "animated" });

    // The same again is a refusal of its own, so it is shown again.
    vm.backgroundEffects.addImage$.value!(new File(["x"], "a.gif"));
    await flushPromises();
    expect(vm.backgroundEffects.imageRefusal$.value).toEqual({
      reason: "animated",
    });
    expect(vm.backgroundEffects.imageRefusal$.value).not.toBe(first);

    store.add.mockRejectedValue(new Error("quota"));
    vm.backgroundEffects.addImage$.value!(new File(["x"], "b.png"));
    await flushPromises();
    expect(vm.backgroundEffects.imageRefusal$.value).toEqual({
      reason: "not-kept",
    });

    store.add.mockResolvedValue("kept");
    vm.backgroundEffects.addImage$.value!(new File(["x"], "c.png"));
    await flushPromises();
    expect(vm.backgroundEffects.imageRefusal$.value).toBeUndefined();
  });

  it("never removes the selected background", () => {
    store.remove.mockResolvedValue();
    const vm = cameraMenu();
    backgroundEffectSetting.setValue("added:worn");
    vm.backgroundEffects.remove$.value!("added:worn");
    expect(store.remove).not.toHaveBeenCalled();
    vm.backgroundEffects.remove$.value!("added:spare");
    expect(store.remove).toHaveBeenCalledWith("spare");
  });

  it("previews the camera only while there is one and it is not muted", () => {
    const muted$ = new BehaviorSubject(false);
    const track = mockVideoTrack({ muted$ });
    const camera$ = new BehaviorSubject<LocalVideoMediaTrack | null>(track);
    const vm = cameraMenu({ camera$ });
    expect(vm.cameraTrack$.value).toBe(track);
    muted$.next(true);
    expect(vm.cameraTrack$.value).toBeNull();
    muted$.next(false);
    expect(vm.cameraTrack$.value).toBe(track);
    camera$.next(null);
    expect(vm.cameraTrack$.value).toBeNull();
  });
});
