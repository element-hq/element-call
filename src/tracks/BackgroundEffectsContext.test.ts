/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, createElement, type FC } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import {
  BackgroundEffectsProvider,
  reportCamera,
  useBackgroundEffects,
  createAppBackgroundEffects,
} from "./BackgroundEffectsContext";
import {
  type BackgroundEffects,
  type BackgroundEffectsState,
} from "../state/BackgroundEffects";
import { backgroundEffect } from "../settings/settings";
import { sdkCamera, type ShownCamera, SyncedCameraTrack } from "./cameraTrack";
import { type AddedBackground } from "./backgroundImages";
import { constant } from "../state/Behavior";
import { flushPromises, mockVideoTrack, testScope } from "../utils/test";

const sdkSupportMock = vi.hoisted(() => vi.fn(() => true));
const pipelines = vi.hoisted(() => ({
  built: 0,
  destroyed: 0,
  switches: [] as unknown[],
}));

// The pipeline itself needs WebGL and MediaPipe; what these tests are about is
// what the provider asks of it.
vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessorWrapper: vi.fn(function (this: Record<string, unknown>) {
    pipelines.built += 1;
    this.switchTo = vi.fn(async (options: unknown) => {
      pipelines.switches.push(options);
      return Promise.resolve();
    });
    this.destroy = vi.fn(async () => {
      pipelines.destroyed += 1;
      return Promise.resolve();
    });
  }),
  supportsBackgroundProcessors: (): boolean => sdkSupportMock(),
}));
const platformMock = vi.hoisted(() => ({ platform: "desktop" }));
vi.mock("../Platform", () => platformMock);
vi.mock("./backgroundImages", async () => {
  const { BehaviorSubject } = await import("rxjs");
  return {
    addedBackgrounds: {
      added$: new BehaviorSubject<AddedBackground[] | undefined>(undefined),
    },
  };
});
vi.mock("./BackgroundEffectTransformer", () => ({
  BackgroundEffectTransformer: vi.fn(),
}));

describe("the synced camera", () => {
  it("is the track last synced, and cleared only while still its own", () => {
    const synced = new SyncedCameraTrack();
    const pipeline = constant<BackgroundEffectsState>({
      supported: false,
      processor: undefined,
      cameraTrack: synced,
    });
    const lobby = sdkCamera(mockVideoTrack({ id: "lobby" }));
    const call = sdkCamera(mockVideoTrack({ id: "call" }));
    const lobbyCamera$ = new BehaviorSubject<ShownCamera | null>(lobby);
    reportCamera(testScope(), lobbyCamera$, pipeline);
    expect(synced.track$.value).toBe(lobby);

    const callScope = testScope();
    reportCamera(callScope, constant(call), pipeline);
    expect(synced.track$.value).toBe(call);

    lobbyCamera$.next(null);
    expect(synced.track$.value).toBe(call);
    callScope.end();
    expect(synced.track$.value).toBeNull();
  });

  it("reports the camera once, however often the pipeline's state changes", () => {
    const synced = new SyncedCameraTrack();
    const report = vi.spyOn(synced, "report");
    const state$ = new BehaviorSubject<BackgroundEffectsState>({
      supported: true,
      processor: undefined,
      cameraTrack: synced,
    });
    reportCamera(testScope(), constant(sdkCamera(mockVideoTrack({}))), state$);
    state$.next({ ...state$.value, settling: true });
    state$.next({ ...state$.value, settling: false });
    expect(report).toHaveBeenCalledOnce();
  });

  it("is the SDK's camera once the call reports it", () => {
    const synced = new SyncedCameraTrack();
    const state$ = constant<BackgroundEffectsState>({
      supported: true,
      processor: undefined,
      cameraTrack: synced,
    });
    const callCamera = mockVideoTrack({ facingMode$: constant("user") });
    const callCamera$ = new BehaviorSubject<ShownCamera | null>(
      sdkCamera(callCamera),
    );
    reportCamera(testScope(), callCamera$, state$);
    expect(synced.track$.value).toBe(sdkCamera(callCamera));
    expect(synced.track$.value?.facesUser()).toBe(true);

    const element = document.createElement("video");
    synced.track$.value!.attach(element);
    expect(callCamera.attach).toHaveBeenCalledWith(element);

    callCamera$.next(null);
    expect(synced.track$.value).toBeNull();
  });

  it("keeps each call's camera to its own", () => {
    const mine = createAppBackgroundEffects(testScope());
    const theirs = createAppBackgroundEffects(testScope());
    const first = sdkCamera(mockVideoTrack({ id: "first" }));
    const second = sdkCamera(mockVideoTrack({ id: "second" }));
    reportCamera(testScope(), constant(first), mine.state$);
    reportCamera(testScope(), constant(second), theirs.state$);

    expect(mine.state$.value.cameraTrack).not.toBe(
      theirs.state$.value.cameraTrack,
    );
    expect(mine.state$.value.cameraTrack?.track$.value).toBe(first);
    expect(theirs.state$.value.cameraTrack?.track$.value).toBe(second);
  });
});

describe("BackgroundEffectsProvider", () => {
  let seen: BackgroundEffectsState[];
  const Surface: FC = () => {
    seen.push(useBackgroundEffects());
    return null;
  };
  // Made on first render, once a test has set up the platform.
  let effects: BackgroundEffects | undefined;
  const surface = (): ReturnType<typeof createElement> =>
    createElement(BackgroundEffectsProvider, {
      effects: (effects ??= createAppBackgroundEffects(testScope())),
      children: createElement(Surface),
    });
  const blur = async (on: boolean): Promise<void> => {
    await act(async () => {
      backgroundEffect.setValue(on ? "blur" : "none");
      await flushPromises();
    });
  };
  const latest = (): BackgroundEffectsState => seen[seen.length - 1];

  beforeEach(() => {
    seen = [];
    effects = undefined;
    pipelines.built = 0;
    pipelines.destroyed = 0;
    pipelines.switches = [];
    platformMock.platform = "desktop";
    sdkSupportMock.mockReturnValue(true);
    backgroundEffect.setValue("none");
  });
  afterEach(() => backgroundEffect.setValue("none"));

  // A pipeline primes itself when it is built and when it is destroyed, and a
  // primed pipeline lets one frame through untouched: so the frame is spent
  // once, as long as it is built once and never taken off the camera.
  it("builds one pipeline on first use and keeps it through every change", async () => {
    render(surface());
    for (const on of [true, false, true, false, true]) await blur(on);

    expect(pipelines.built).toBe(1);
    expect(pipelines.destroyed).toBe(0);
    expect(latest().processor).toBeDefined();
  });

  it("runs on a phone whose browser can run it", async () => {
    platformMock.platform = "ios";
    render(surface());
    await blur(true);

    expect(latest().supported).toBe(true);
    expect(latest().processor).toBeDefined();
  });

  it("switches to an effect chosen while the camera is off", async () => {
    render(surface());
    await blur(true);

    // Already switched to blur, with nothing yet to attach it to
    expect(pipelines.switches).toEqual([
      { mode: "background-blur", blurRadius: 15 },
    ]);
    expect(pipelines.built).toBe(1);
  });
});
