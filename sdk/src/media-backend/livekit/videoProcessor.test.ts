/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  LocalVideoTrack,
  Track,
  type TrackProcessor,
  type VideoProcessorOptions,
} from "livekit-client";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { type VideoProcessor } from "../../media-api";
import { fromLivekitProcessor, toLivekitProcessor } from "./videoProcessor";

describe("toLivekitProcessor", () => {
  const captured = { id: "captured" } as MediaStreamTrack;
  const processed = { id: "processed" } as MediaStreamTrack;
  const restarted = { id: "restarted" } as MediaStreamTrack;
  const element = document.createElement("video");
  const options: VideoProcessorOptions = {
    kind: Track.Kind.Video,
    track: captured,
    element,
  };

  function fakeProcessor(): VideoProcessor {
    return {
      name: "blur",
      init: vi.fn().mockResolvedValue(processed),
      restart: vi.fn().mockResolvedValue(restarted),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("holds the processed track where LiveKit reads it", async () => {
    const processor = fakeProcessor();
    const adapter = toLivekitProcessor(processor);
    expect(adapter.name).toBe("blur");
    expect(adapter.processedTrack).toBeUndefined();

    await adapter.init(options);
    expect(processor.init).toHaveBeenCalledWith(captured, element);
    expect(adapter.processedTrack).toBe(processed);

    await adapter.restart(options);
    expect(adapter.processedTrack).toBe(restarted);

    await adapter.destroy();
    expect(processor.destroy).toHaveBeenCalled();
  });

  // A stopped track tears its processor down without waiting, while the track
  // replacing it initialises the same one
  it("runs a destroy and the next init on one processor in turn, across adapters", async () => {
    const processor = fakeProcessor();
    let finishDestroy = (): void => {};
    vi.mocked(processor.destroy).mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          finishDestroy = resolve;
        }),
    );
    const previous = toLivekitProcessor(processor);
    const next = toLivekitProcessor(processor);
    await previous.init(options);
    vi.mocked(processor.init).mockClear();

    const destroying = previous.destroy();
    const initialising = next.init(options);
    await Promise.resolve();
    expect(processor.init).not.toHaveBeenCalled();

    finishDestroy();
    await Promise.all([destroying, initialising]);
    expect(processor.init).toHaveBeenCalledOnce();
    expect(next.processedTrack).toBe(processed);
  });
});

describe("a processor set on a camera that is off", () => {
  const ended = { id: "ended", readyState: "ended" } as MediaStreamTrack;

  function fakeProcessor(): VideoProcessor {
    return {
      name: "blur",
      init: vi.fn().mockResolvedValue({ id: "processed" }),
      restart: vi.fn().mockResolvedValue({ id: "restarted" }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("builds on the restart that turns the camera on, not before", async () => {
    const processor = fakeProcessor();
    const adapter = toLivekitProcessor(processor);

    await adapter.init({ kind: Track.Kind.Video, track: ended });
    expect(processor.init).not.toHaveBeenCalled();
    expect(adapter.processedTrack).toBeUndefined();

    const live = { id: "live", readyState: "live" } as MediaStreamTrack;
    await adapter.restart({ kind: Track.Kind.Video, track: live });
    expect(processor.init).toHaveBeenCalledWith(live, undefined);
    expect(processor.restart).not.toHaveBeenCalled();
    expect(adapter.processedTrack).toEqual({ id: "processed" });
  });

  // The processor may be the app's one pipeline, running on another track
  it("leaves the processor alone when let go before it was built", async () => {
    const processor = fakeProcessor();
    const adapter = toLivekitProcessor(processor);
    await adapter.init({ kind: Track.Kind.Video, track: ended });
    await adapter.destroy();
    expect(processor.destroy).not.toHaveBeenCalled();
  });

  // LiveKit's own camera track, so that the order of its restart is what is
  // tested: a raw frame handed to the sender would reach the room
  describe("on LiveKit's camera track", () => {
    // jsdom has no MediaStream; LiveKit wraps every track in one
    beforeAll(() => {
      const original = globalThis.MediaStream;
      globalThis.MediaStream = class {
        public constructor(private readonly tracks: MediaStreamTrack[] = []) {}
        public getTracks(): MediaStreamTrack[] {
          return this.tracks;
        }
        public getVideoTracks(): MediaStreamTrack[] {
          return this.tracks.filter(({ kind }) => kind === "video");
        }
        public getAudioTracks(): MediaStreamTrack[] {
          return this.tracks.filter(({ kind }) => kind === "audio");
        }
        public addTrack(track: MediaStreamTrack): void {
          this.tracks.push(track);
        }
        public removeTrack(track: MediaStreamTrack): void {
          this.tracks.splice(this.tracks.indexOf(track), 1);
        }
      } as unknown as typeof MediaStream;
      // LiveKit plays its processor element and catches a refusal
      const play = vi
        .spyOn(HTMLMediaElement.prototype, "play")
        .mockResolvedValue(undefined);
      return (): void => {
        globalThis.MediaStream = original;
        play.mockRestore();
      };
    });

    function deviceTrack(id: string): MediaStreamTrack {
      const track = {
        kind: "video",
        id,
        label: "",
        enabled: true,
        readyState: "live",
        getSettings: () => ({}),
        getConstraints: () => ({}),
        getCapabilities: () => ({}),
        applyConstraints: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        stop: vi.fn(() => {
          Object.assign(track, { readyState: "ended" });
        }),
      };
      return track as unknown as MediaStreamTrack;
    }

    it("hands the sender only processed frames when the camera turns on", async () => {
      const reacquired = deviceTrack("reacquired");
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [reacquired],
          }),
        },
      });
      const processedTrack = { id: "processed" } as MediaStreamTrack;
      const processor = {
        ...fakeProcessor(),
        init: vi.fn().mockResolvedValue(processedTrack),
      };
      const camera = new LocalVideoTrack(deviceTrack("first"), {}, false);
      camera.source = Track.Source.Camera;
      const replaceTrack = vi.fn().mockResolvedValue(undefined);
      Object.assign(camera, {
        sender: {
          replaceTrack,
          getParameters: () => ({ encodings: [] }),
          setParameters: vi.fn().mockResolvedValue(undefined),
        },
      });

      await camera.mute();
      expect(camera.mediaStreamTrack.readyState).toBe("ended");
      // What the camera sent before it was turned off is not in question
      replaceTrack.mockClear();
      await camera.setProcessor(toLivekitProcessor(processor));
      await camera.unmute();

      expect(processor.init).toHaveBeenCalledWith(
        reacquired,
        expect.anything(),
      );
      expect(replaceTrack.mock.calls).toEqual([[processedTrack]]);
      // LiveKit plays attached elements again on a timer
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});

describe("fromLivekitProcessor", () => {
  const captured = { id: "captured" } as MediaStreamTrack;
  const processed = { id: "processed" } as MediaStreamTrack;

  function fakeLivekitProcessor(
    processedTrack: MediaStreamTrack | undefined,
  ): TrackProcessor<Track.Kind.Video> {
    return {
      name: "background-blur",
      processedTrack,
      init: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("resolves with the track the LiveKit processor produced", async () => {
    const livekitProcessor = fakeLivekitProcessor(processed);
    const processor = fromLivekitProcessor(livekitProcessor);
    expect(processor.name).toBe("background-blur");
    await expect(processor.init(captured)).resolves.toBe(processed);
    expect(livekitProcessor.init).toHaveBeenCalledWith({
      kind: Track.Kind.Video,
      track: captured,
    });
    await expect(processor.restart(captured)).resolves.toBe(processed);
    await processor.destroy();
    expect(livekitProcessor.destroy).toHaveBeenCalled();
  });

  it("rejects where the LiveKit processor produced no track", async () => {
    await expect(
      fromLivekitProcessor(fakeLivekitProcessor(undefined)).init(captured),
    ).rejects.toThrow("produced no track");
  });
});
