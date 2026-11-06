/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";

import {
  type HandedOverTrack,
  type LocalMedia,
  type LocalVideoMediaTrack,
  type PublishRequest,
  type VideoProcessor,
} from "../../media-api";
import { constant } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { MediaConnectionState } from "../api";
import {
  createFullMeshLocalMedia,
  type FullMeshLocalMedia,
} from "./LocalMedia";
import { FakeMediaStream, fakeTrack, installWebRtcFakes } from "./test";

const microphone: PublishRequest = { source: "microphone" };
const camera: PublishRequest = { source: "camera" };

describe("createFullMeshLocalMedia", () => {
  let scope: ObservableScope;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installWebRtcFakes();
    getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const tracks: MediaStreamTrack[] = [];
      if (constraints.audio) tracks.push(fakeTrack("audio"));
      if (constraints.video)
        tracks.push(fakeTrack("video", { deviceId: "cam-in-use" }));
      return Promise.resolve(new FakeMediaStream(tracks));
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    // jsdom has no media playback
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    scope = new ObservableScope();
  });
  afterEach(() => {
    scope.end();
    vi.unstubAllGlobals();
  });

  function create(
    publish: PublishRequest[],
    media?: LocalMedia,
  ): FullMeshLocalMedia {
    return createFullMeshLocalMedia({
      scope,
      publish,
      media,
      connectionState$: constant(MediaConnectionState.Connected),
      peerConnections: () => [],
      logger,
    });
  }

  /** Starts publishing and waits for the capture (or the take-over) to finish. */
  async function start(
    local: FullMeshLocalMedia,
    sources: string[],
  ): Promise<void> {
    local.setPublishing(true);
    await vi.waitFor(() =>
      expect(local.publications$.value.map((p) => p.source)).toEqual(sources),
    );
  }

  function publication(
    local: FullMeshLocalMedia,
    source: string,
  ): FullMeshLocalMedia["publications$"]["value"][number] {
    const found = local.publications$.value.find((p) => p.source === source);
    if (found === undefined) throw new Error(`No ${source} publication`);
    return found;
  }

  it("captures the requests at the first start", async () => {
    const local = create([microphone, camera]);
    expect(local.tracks$.value).toBeNull();

    await start(local, ["microphone", "camera"]);

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(local.tracks$.value?.map((t) => t.source)).toEqual([
      "microphone",
      "camera",
    ]);
  });

  it("takes a lobby's tracks over instead of capturing", async () => {
    const processor = fakeProcessor();
    const handed = {
      microphone: handedTrack("audio", { muted: true }),
      camera: handedTrack("video", {
        constraints: { deviceId: "lobby-cam" },
        processor: { processor, processedTrack: processor.output },
      }),
    };
    const media = fakeMedia([microphone, camera], handed);
    const local = create(media.requests, media);

    await start(local, ["microphone", "camera"]);

    expect(media.takeTracks).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
    const mic = publication(local, "microphone");
    expect(mic.track$.value).toBe(handed.microphone.track);
    expect(handed.microphone.track.enabled).toBe(false);
    expect(mic.mediaTrack.muted$.value).toBe(true);
    // The running processor is adopted with its output
    const cam = publication(local, "camera");
    expect(cam.track$.value).toBe(processor.output);
    expect(processor.init).not.toHaveBeenCalled();
    expect(cam.mediaTrack.muted$.value).toBe(false);

    // Turned off and on again, the camera reopens on the lobby's device and
    // restarts the processor rather than initialising it again
    await cam.mediaTrack.setEnabled(false);
    expect(handed.camera.track.stop).toHaveBeenCalled();
    expect(processor.output.stop).toHaveBeenCalled();
    await cam.mediaTrack.setEnabled(true);
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      video: expect.objectContaining({ deviceId: { exact: "lobby-cam" } }),
    });
    expect(processor.restart).toHaveBeenCalledOnce();
    expect(processor.init).not.toHaveBeenCalled();
  });

  it("releases a camera that was muted in the lobby", async () => {
    const handed = { camera: handedTrack("video", { muted: true }) };
    const media = fakeMedia([camera], handed);
    const local = create(media.requests, media);

    await start(local, ["camera"]);

    const cam = publication(local, "camera");
    expect(handed.camera.track.stop).toHaveBeenCalled();
    expect(cam.track$.value).toBeNull();
    expect(cam.mediaTrack.muted$.value).toBe(true);
  });

  it("stops handed over tracks it no longer wants", async () => {
    const handed = { camera: handedTrack("video") };
    const media = fakeMedia([microphone], handed);
    const local = create(media.requests, media);

    await start(local, ["microphone"]);

    expect(handed.camera.track.stop).toHaveBeenCalled();
  });

  it("builds a processor set while the camera is off once it turns on", async () => {
    const processor = fakeProcessor();
    const local = create([camera]);
    await start(local, ["camera"]);
    const cam = publication(local, "camera");
    const { setProcessor } = cam.mediaTrack as LocalVideoMediaTrack;
    const raw = cam.track$.value;

    await cam.mediaTrack.setEnabled(false);
    await setProcessor(processor);
    expect(processor.init).not.toHaveBeenCalled();
    // Setting it again changes nothing
    await setProcessor(processor);

    await cam.mediaTrack.setEnabled(true);
    expect(processor.init).toHaveBeenCalledOnce();
    expect(processor.init).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "video" }),
      expect.any(HTMLVideoElement),
    );
    expect(cam.track$.value).toBe(processor.output);
    expect(cam.track$.value).not.toBe(raw);
    expect(processor.destroy).not.toHaveBeenCalled();

    // Removed, the raw track goes out again and the processor is torn down
    await setProcessor(undefined);
    expect(processor.destroy).toHaveBeenCalledOnce();
    expect(processor.output.stop).toHaveBeenCalled();
    expect(cam.track$.value?.kind).toBe("video");
    expect(cam.track$.value).not.toBe(processor.output);
  });

  it("runs a processor's steps one after the other", async () => {
    const processor = fakeProcessor();
    let initDone: (() => void) | undefined;
    processor.init.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          initDone = (): void => resolve(processor.output);
        }),
    );
    const local = create([camera]);
    await start(local, ["camera"]);
    const cam = publication(local, "camera");
    const { setProcessor } = cam.mediaTrack as LocalVideoMediaTrack;

    // Set while the camera is on, then the camera is turned off and on while
    // its init still runs: the reopen waits for it and restarts it, rather
    // than initialising it a second time on the new track
    const setting = setProcessor(processor);
    await vi.waitFor(() => expect(processor.init).toHaveBeenCalledOnce());
    await cam.mediaTrack.setEnabled(false);
    const turningOn = cam.mediaTrack.setEnabled(true);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(processor.restart).not.toHaveBeenCalled();

    initDone?.();
    await setting;
    await turningOn;
    expect(processor.init).toHaveBeenCalledOnce();
    expect(processor.restart).toHaveBeenCalledOnce();
    expect(cam.track$.value).toBe(processor.output);
  });
});

function fakeProcessor(): VideoProcessor & {
  output: MediaStreamTrack;
  init: Mock<VideoProcessor["init"]>;
  restart: Mock<VideoProcessor["restart"]>;
  destroy: Mock<VideoProcessor["destroy"]>;
} {
  const output = fakeTrack("video");
  return {
    name: "blur",
    output,
    init: vi.fn(async () => Promise.resolve(output)),
    restart: vi.fn(async () => Promise.resolve(output)),
    destroy: vi.fn(async () => Promise.resolve()),
  };
}

function handedTrack(
  kind: "audio" | "video",
  rest: Partial<Omit<HandedOverTrack, "track">> = {},
): HandedOverTrack {
  return { track: fakeTrack(kind), constraints: {}, muted: false, ...rest };
}

/** A lobby's media, as the participation hands it over: only `takeTracks` matters here. */
function fakeMedia(
  requests: PublishRequest[],
  handed: Partial<Record<"microphone" | "camera", HandedOverTrack>>,
): LocalMedia & { takeTracks: ReturnType<typeof vi.fn> } {
  return {
    requests,
    tracks$: new BehaviorSubject([]),
    capture: vi.fn(),
    release: vi.fn(),
    stop: vi.fn(),
    takeTracks: vi.fn(
      () =>
        new Map(
          Object.entries(handed) as [
            "microphone" | "camera",
            HandedOverTrack,
          ][],
        ),
    ),
  } as unknown as LocalMedia & { takeTracks: ReturnType<typeof vi.fn> };
}
