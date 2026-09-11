/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";

import {
  useMicrophoneLevel,
  type MicrophoneLevelState,
} from "./useMicrophoneLevel";

/** However many levels a caller says it can draw; the meter asks for 18. */
const STEPS = 18;

describe("useMicrophoneLevel", () => {
  test("level indicator follows the microphone signal level", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", true, STEPS),
    );
    await waitFor(() => expect(result.current.type).toBe("active"));
    expect(result.current).toEqual({ type: "active", level: 0 });

    // Speech arrives.
    amplitude = 0.2;
    tick(4);
    expect(result.current.type).toBe("active");
    const loud = result.current as { type: "active"; level: number };
    expect(loud.level).toBeGreaterThan(0.3);

    // ...and stops. The level eases back down rather than snapping to zero.
    amplitude = 0;
    tick(30);
    const quiet = result.current as { type: "active"; level: number };
    expect(quiet.level).toBeLessThan(loud.level);
  });

  test("metering resumes a capture the browser starts suspended", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", true, STEPS),
    );
    await waitFor(() => expect(result.current.type).toBe("active"));

    // A suspended context reports silence however loud the microphone is,
    // which is what Firefox hands us when the page has no user activation.
    expect(resumed).toBe(1);
  });

  test("a silent microphone re-renders nothing", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const probe = renderProbe();
    await waitFor(() => expect(probe.state().type).toBe("active"));

    // The capture keeps sampling, but a frame that would draw the same bars
    // must not re-render the menu the meter sits in.
    const before = probe.renders();
    tick(30);
    expect(probe.renders() - before).toBeLessThanOrEqual(1);
  });

  test("a steady tone re-renders only until the level settles", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const probe = renderProbe();
    await waitFor(() => expect(probe.state().type).toBe("active"));

    amplitude = 0.2;
    tick(20);
    expect(probe.state()).toEqual({
      type: "active",
      level: expect.any(Number),
    });

    const before = probe.renders();
    tick(20);
    expect(probe.renders() - before).toBeLessThanOrEqual(1);
  });

  test("the reported level is one the meter can draw", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", true, STEPS),
    );
    await waitFor(() => expect(result.current.type).toBe("active"));

    amplitude = 0.2;
    tick(6);
    const { level } = result.current as { level: number };
    expect(level * STEPS).toBeCloseTo(Math.round(level * STEPS), 9);
  });

  test("level indicator stays idle for a silent microphone", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", true, STEPS),
    );
    await waitFor(() => expect(result.current.type).toBe("active"));
    tick(10);
    expect(result.current).toEqual({ type: "active", level: 0 });
  });

  test("capture is re-pointed when the microphone changes", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMicrophoneLevel(id, true, STEPS),
      { initialProps: { id: "mic-1" } },
    );
    await waitFor(() => expect(result.current.type).toBe("active"));
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "mic-1" } },
    });

    rerender({ id: "mic-2" });
    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({
        audio: { deviceId: { exact: "mic-2" } },
      }),
    );
    // The capture of the microphone we left must not survive the switch.
    expect(first.stop).toHaveBeenCalled();
    expect(second.stop).not.toHaveBeenCalled();
  });

  test("menu capture is released when closed during a device switch", async () => {
    const { stream, stop } = fakeStream();
    let resolveCapture: (s: MediaStream) => void = () => {};
    const capture = new Promise<MediaStream>((resolve) => {
      resolveCapture = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(capture);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useMicrophoneLevel("mic-1", on, STEPS),
      { initialProps: { on: true } },
    );

    // The menu closes before the microphone finishes opening.
    rerender({ on: false });
    await act(async () => {
      resolveCapture(stream);
      await capture;
    });

    expect(stop).toHaveBeenCalled();
    expect(result.current).toEqual({ type: "inactive" });
    expect(frames).toHaveLength(0);
  });

  test("microphone capture is closed when metering stops", async () => {
    const { stream, stop } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useMicrophoneLevel("mic-1", on, STEPS),
      { initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current.type).toBe("active"));

    rerender({ on: false });
    expect(stop).toHaveBeenCalled();
    expect(closed).toBe(1);
    expect(result.current).toEqual({ type: "inactive" });
  });

  test("a denied microphone is distinguished from one that cannot be opened", async () => {
    const denied = Object.assign(new Error("no"), { name: "NotAllowedError" });
    const busy = Object.assign(new Error("busy"), { name: "NotReadableError" });
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(denied)
      .mockRejectedValueOnce(busy);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMicrophoneLevel(id, true, STEPS),
      { initialProps: { id: "mic-1" } },
    );
    await waitFor(() => expect(result.current).toEqual({ type: "denied" }));

    rerender({ id: "mic-2" });
    await waitFor(() =>
      expect(result.current).toEqual({ type: "unavailable" }),
    );
  });

  test("level indicator is unavailable where the page has no media devices", () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", true, STEPS),
    );
    expect(result.current).toEqual({ type: "unavailable" });
  });

  test("no capture is taken while metering is disabled", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useMicrophoneLevel("mic-1", false, STEPS),
    );
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current).toEqual({ type: "inactive" });
  });

  let amplitude = 0;
  let frames: (() => void)[] = [];
  let closed = 0;
  let resumed = 0;

  beforeEach(() => {
    amplitude = 0;
    frames = [];
    closed = 0;
    resumed = 0;

    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = [];
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        public createAnalyser(): unknown {
          return {
            fftSize: 1024,
            getFloatTimeDomainData: (out: Float32Array): void => {
              out.fill(amplitude);
            },
          };
        }
        public createMediaStreamSource(): { connect: () => void } {
          return { connect: (): void => {} };
        }
        public async resume(): Promise<void> {
          resumed++;
          await Promise.resolve();
        }
        public async close(): Promise<void> {
          closed++;
          await Promise.resolve();
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  /** A microphone that reports a constant amplitude on every sample. */
  function fakeStream(): {
    stream: MediaStream;
    stop: ReturnType<typeof vi.fn>;
  } {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    return { stream, stop };
  }

  /**
   * Renders a component around the hook and counts how often it renders, which
   * is what the menu around the meter would pay on every animation frame.
   */
  function renderProbe(): {
    renders: () => number;
    state: () => MicrophoneLevelState;
  } {
    let renders = 0;
    let state: MicrophoneLevelState = { type: "inactive" };
    function Probe(): null {
      const current = useMicrophoneLevel("mic-1", true, STEPS);
      // An effect with no dependencies runs once per commit, so a frame
      // React bails out of is not counted.
      useEffect(() => {
        renders++;
        state = current;
      });
      return null;
    }
    render(<Probe />);
    return { renders: () => renders, state: () => state };
  }

  /** Runs one animation frame, if the hook has asked for one. */
  function tick(times = 1): void {
    for (let i = 0; i < times; i++) {
      const pending = frames;
      frames = [];
      act(() => {
        pending.forEach((f) => f());
      });
    }
  }
});
