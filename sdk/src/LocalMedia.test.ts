/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createLocalMedia, type GetUserMedia } from "./LocalMedia";
import { type LocalVideoMediaTrack, type VideoProcessor } from "./media-api";

describe("createLocalMedia", () => {
  it("opens the microphone and the camera in one request", async () => {
    const getUserMedia = fakeGetUserMedia();
    const media = createLocalMedia(getUserMedia);

    const tracks = await media.capture([
      { source: "microphone", deviceId: "mic" },
      {
        source: "camera",
        capture: { resolution: { width: 640, height: 480 } },
      },
    ]);

    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      audio: { deviceId: "mic" },
      video: { width: 640, height: 480, frameRate: undefined },
    });
    expect(tracks.map((t) => t.source)).toEqual(["microphone", "camera"]);
    expect(media.tracks$.value).toEqual(tracks);
    expect(media.requests.map((r) => r.source)).toEqual([
      "microphone",
      "camera",
    ]);
  });

  it("joins an identical capture still in flight rather than opening the devices again", async () => {
    const getUserMedia = fakeGetUserMedia();
    const media = createLocalMedia(getUserMedia);
    const requests = [{ source: "camera" as const }];

    const [first, second] = await Promise.all([
      media.capture(requests),
      media.capture(requests),
    ]);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(media.tracks$.value).toEqual(first);
  });

  it("shows the processor's output, initialised once", async () => {
    const processor = fakeProcessor();
    const media = createLocalMedia(fakeGetUserMedia());
    const [camera] = await media.capture([{ source: "camera", processor }]);
    const element = document.createElement("video");

    camera.attach(element);

    expect(processor.init).toHaveBeenCalledOnce();
    expect(tracksOn(element)).toEqual([processor.output]);
  });

  it("hands the tracks over as they are: no second capture, no second init", async () => {
    const getUserMedia = fakeGetUserMedia();
    const processor = fakeProcessor();
    const media = createLocalMedia(getUserMedia);
    const [microphone, camera] = await media.capture([
      { source: "microphone" },
      { source: "camera", processor },
    ]);

    const taken = media.takeTracks();

    expect(taken.get("microphone")?.track).toBe(trackBehind(microphone));
    expect(taken.get("camera")).toEqual({
      track: trackBehind(camera),
      constraints: {},
      muted: false,
      processor: { processor, processedTrack: processor.output },
    });
    expect(media.tracks$.value).toEqual([]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(processor.init).toHaveBeenCalledOnce();
    expect(processor.destroy).not.toHaveBeenCalled();
    media.stop();
    expect(taken.get("camera")!.track.stop).not.toHaveBeenCalled();
  });

  it("finishes a handed-over track", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [camera] = await media.capture([{ source: "camera" }]);
    const element = document.createElement("video");
    camera.attach(element);

    media.takeTracks();

    expect(element.srcObject).toBeNull();
    await expect(camera.setEnabled(false)).rejects.toThrow("handed over");
    expect(() => camera.attach(element)).toThrow("handed over");
  });

  it("mutes by disabling the track and hands the mute over", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [microphone] = await media.capture([{ source: "microphone" }]);

    await expect(microphone.setEnabled(false)).resolves.toBe(false);

    expect(microphone.muted$.value).toBe(true);
    expect(trackBehind(microphone).enabled).toBe(false);
    expect(media.takeTracks().get("microphone")?.muted).toBe(true);
  });

  it("switches the device by opening it anew", async () => {
    const getUserMedia = fakeGetUserMedia();
    const processor = fakeProcessor();
    const media = createLocalMedia(getUserMedia);
    const [camera] = await media.capture([{ source: "camera", processor }]);
    const first = trackBehind(camera);
    const element = document.createElement("video");
    camera.attach(element);

    await camera.setDevice("other");

    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: "other" },
    });
    expect(first.stop).toHaveBeenCalled();
    expect(processor.restart).toHaveBeenCalledOnce();
    const [restartedOn, input] = vi.mocked(processor.restart).mock.calls[0];
    expect(restartedOn).not.toBe(first);
    expect(input).toBe(vi.mocked(processor.init).mock.calls[0][1]);
    expect(tracksOn(element)).toEqual([processor.output]);
    expect(media.takeTracks().get("camera")?.constraints).toEqual({
      deviceId: "other",
    });
  });

  it("reports the facing mode and switches it", async () => {
    const getUserMedia = fakeGetUserMedia({ facingMode: "user" });
    const media = createLocalMedia(getUserMedia);
    const [camera] = (await media.capture([{ source: "camera" }])) as [
      LocalVideoMediaTrack,
    ];
    expect(camera.facingMode$.value).toBe("user");

    await camera.switchFacingMode();

    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: "environment" },
    });
  });

  it("releases one device and stops the rest", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [microphone, camera] = await media.capture([
      { source: "microphone" },
      { source: "camera" },
    ]);

    media.release("camera");
    expect(trackBehind(camera).stop).toHaveBeenCalled();
    expect(media.tracks$.value).toEqual([microphone]);
    expect(media.requests.map((r) => r.source)).toEqual(["microphone"]);

    media.stop();
    expect(trackBehind(microphone).stop).toHaveBeenCalled();
    expect(media.tracks$.value).toEqual([]);
  });

  it("refuses a screen share", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    await expect(media.capture([{ source: "screenShare" }])).rejects.toThrow(
      "screen share",
    );
  });
});

class FakeMediaStream {
  public constructor(private readonly tracks: MediaStreamTrack[]) {}
  public getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

beforeAll(() => {
  globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
});

let nextId = 0;
const tracksById = new Map<string, MediaStreamTrack>();

function fakeTrack(
  kind: "audio" | "video",
  settings: MediaTrackSettings = {},
): MediaStreamTrack {
  const track = {
    kind,
    id: `${kind}-${nextId++}`,
    enabled: true,
    stop: vi.fn(),
    getSettings: () => settings,
  } as unknown as MediaStreamTrack;
  tracksById.set(track.id, track);
  return track;
}

function fakeGetUserMedia(videoSettings?: MediaTrackSettings): GetUserMedia {
  return vi.fn(async (constraints: MediaStreamConstraints) => {
    const tracks: MediaStreamTrack[] = [];
    if (constraints.audio) tracks.push(fakeTrack("audio"));
    if (constraints.video) tracks.push(fakeTrack("video", videoSettings));
    return Promise.resolve(
      new FakeMediaStream(tracks) as unknown as MediaStream,
    );
  });
}

function fakeProcessor(): VideoProcessor & { output: MediaStreamTrack } {
  const output = fakeTrack("video");
  return {
    name: "blur",
    output,
    init: vi.fn(async () => Promise.resolve(output)),
    restart: vi.fn(async () => Promise.resolve(output)),
    destroy: vi.fn(async () => Promise.resolve()),
  };
}

/** The device's track, which a media track was created on and keeps the id of. */
function trackBehind(mediaTrack: { id: string }): MediaStreamTrack {
  return tracksById.get(mediaTrack.id)!;
}

function tracksOn(element: HTMLMediaElement): MediaStreamTrack[] {
  return (element.srcObject as unknown as FakeMediaStream).getTracks();
}
