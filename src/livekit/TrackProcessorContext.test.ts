/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, createElement, type FC } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LocalVideoTrack } from "livekit-client";
import {
  type BackgroundOptions,
  type ProcessorWrapper,
} from "@livekit/track-processors";

import {
  applyProcessor,
  ProcessorProvider,
  type ProcessorState,
  trackProcessorSync,
  useTrackProcessor,
  useTrackProcessorSync,
} from "./TrackProcessorContext";
import { backgroundEffect } from "../settings/settings";
import { constant } from "../state/Behavior";
import { flushPromises, testScope } from "../utils/test";

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
// A phone: the pipeline must not ask.
vi.mock("../Platform", () => ({ platform: "ios" }));
vi.mock("./BackgroundEffectTransformer", () => ({
  BackgroundEffectTransformer: vi.fn(),
}));

const processor = {} as ProcessorWrapper<BackgroundOptions>;

function mockTrack(
  readyState: MediaStreamTrackState,
  current?: ProcessorWrapper<BackgroundOptions>,
): LocalVideoTrack {
  return {
    mediaStreamTrack: { readyState },
    getProcessor: vi.fn().mockReturnValue(current),
    setProcessor: vi.fn().mockResolvedValue(undefined),
    stopProcessor: vi.fn().mockResolvedValue(undefined),
  } as unknown as LocalVideoTrack;
}

describe("applyProcessor", () => {
  it("attaches the processor to a live track", () => {
    const track = mockTrack("live");
    applyProcessor(track, processor);
    expect(track.setProcessor).toHaveBeenCalledWith(processor);
  });

  it("does not attach the processor to an ended track", () => {
    const track = mockTrack("ended");
    applyProcessor(track, processor);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it("does not surface a rejected setProcessor", async () => {
    const track = mockTrack("live");
    vi.mocked(track.setProcessor).mockRejectedValue(
      new TypeError("Input track cannot be ended"),
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    applyProcessor(track, processor);
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("stops the processor when none is wanted", () => {
    const track = mockTrack("live", processor);
    applyProcessor(track, undefined);
    expect(track.stopProcessor).toHaveBeenCalled();
  });

  it("does not surface a rejected stopProcessor", async () => {
    const track = mockTrack("live", processor);
    vi.mocked(track.stopProcessor).mockRejectedValue(new Error("nope"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    applyProcessor(track, undefined);
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("trackProcessorSync", () => {
  it("applies the processor to the current track", () => {
    const track = mockTrack("live");
    trackProcessorSync(
      testScope(),
      constant(track),
      constant({ supported: true, processor }),
    );
    expect(track.setProcessor).toHaveBeenCalledWith(processor);
  });
});

describe("ProcessorProvider", () => {
  /** A camera track that holds whatever processor it is given. */
  function cameraTrack(): LocalVideoTrack {
    let current: unknown;
    return {
      mediaStreamTrack: { readyState: "live" },
      getProcessor: vi.fn(() => current),
      setProcessor: vi.fn(async (next: unknown) => {
        current = next;
        return Promise.resolve();
      }),
      stopProcessor: vi.fn(async () => {
        current = undefined;
        return Promise.resolve();
      }),
    } as unknown as LocalVideoTrack;
  }

  let seen: ProcessorState[];
  const Surface: FC<{ track: LocalVideoTrack | null }> = ({ track }) => {
    seen.push(useTrackProcessor());
    useTrackProcessorSync(track);
    return null;
  };
  // One component for every render, so a rerender updates the tree rather than
  // mounting a second provider with a pipeline of its own.
  const Surfaces: FC<{ tracks: (LocalVideoTrack | null)[] }> = ({ tracks }) =>
    createElement(
      ProcessorProvider,
      null,
      createElement(
        "div",
        null,
        ...tracks.map((track, key) => createElement(Surface, { key, track })),
      ),
    );
  const surfaces = (
    ...tracks: (LocalVideoTrack | null)[]
  ): ReturnType<typeof createElement> => createElement(Surfaces, { tracks });
  const blur = async (on: boolean): Promise<void> => {
    await act(async () => {
      backgroundEffect.setValue(on ? "blur" : "none");
      await flushPromises();
    });
  };
  const latest = (): ProcessorState => seen[seen.length - 1];

  beforeEach(() => {
    seen = [];
    pipelines.built = 0;
    pipelines.destroyed = 0;
    pipelines.switches = [];
    sdkSupportMock.mockReturnValue(true);
    backgroundEffect.setValue("none");
  });
  afterEach(() => backgroundEffect.setValue("none"));

  // A pipeline primes itself when it is built and when it is destroyed, and a
  // primed pipeline lets one frame through untouched: so the frame is spent
  // once, as long as it is built once and never taken off the camera.
  it("spends one priming frame on first use and none afterwards", async () => {
    const track = cameraTrack();
    render(surfaces(track));
    for (const on of [true, false, true, false, true]) await blur(on);

    expect(pipelines.built).toBe(1);
    expect(pipelines.destroyed).toBe(0);
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(track.stopProcessor).not.toHaveBeenCalled();
  });

  it("camera on with an effect chosen publishes nothing unprocessed", async () => {
    const view = render(surfaces(cameraTrack()));
    await blur(true);
    const pipeline = latest().processor;

    // Camera off, then on again: a new track, given the pipeline as it
    // arrives, and the pipeline neither rebuilt nor switched again.
    await act(async () => {
      view.rerender(surfaces(null));
      await flushPromises();
    });
    const again = cameraTrack();
    await act(async () => {
      view.rerender(surfaces(again));
      await flushPromises();
    });
    expect(again.setProcessor).toHaveBeenCalledTimes(1);
    expect(again.setProcessor).toHaveBeenCalledWith(pipeline);
    expect(pipelines.built).toBe(1);
    expect(pipelines.switches).toHaveLength(1);
  });

  it("runs on a phone whose browser can run it", async () => {
    const track = cameraTrack();
    render(surfaces(track));
    await blur(true);

    expect(latest().supported).toBe(true);
    expect(track.setProcessor).toHaveBeenCalledWith(latest().processor);
  });

  it("preview and call share one pipeline", async () => {
    const preview = cameraTrack();
    const call = cameraTrack();
    render(surfaces(preview, call));
    await blur(true);

    const pipeline = latest().processor;
    expect(preview.setProcessor).toHaveBeenCalledWith(pipeline);
    expect(call.setProcessor).toHaveBeenCalledWith(pipeline);
    expect(pipelines.built).toBe(1);
  });

  it("applies an effect chosen while the camera is off", async () => {
    const view = render(surfaces(null));
    await blur(true);
    // Already switched to blur, with nothing yet to attach it to.
    expect(pipelines.switches).toEqual([
      { mode: "background-blur", blurRadius: 15 },
    ]);

    const track = cameraTrack();
    await act(async () => {
      view.rerender(surfaces(track));
      await flushPromises();
    });
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(track.setProcessor).toHaveBeenCalledWith(latest().processor);
    expect(pipelines.built).toBe(1);
    expect(pipelines.switches).toHaveLength(1);
  });
});
