/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { BehaviorSubject, of } from "rxjs";
import {
  constant,
  type LocalAudioMediaTrack,
  type LocalMedia,
  type LocalVideoMediaTrack,
  type PublishRequest,
  type VideoProcessor,
} from "@element-hq/matrixrtc-sdk";

import { createLobbyMediaViewModel } from "./LobbyMediaViewModel";
import { type MediaDevices } from "./MediaDevices";
import { MuteStates } from "./MuteStates";
import { nullHostBridge } from "../HostBridge";
import { flushPromises, mockMediaDevices, testScope } from "../utils/test";

describe("LobbyMediaViewModel", () => {
  it("opens what starts enabled in one capture and follows the devices", async () => {
    const { media, vm, mediaDevices } = setup();
    await flushPromises();

    expect(media.capture).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ source: "microphone", deviceId: "mic" }),
      // With the processor, so that the camera starts with it
      expect.objectContaining({ source: "camera", deviceId: "cam", processor }),
    ]);
    const camera = vm.videoTrack$.value!;
    expect(camera.source).toBe("camera");
    expect(camera.setDevice).toHaveBeenCalledWith("cam");
    expect(camera.setProcessor).toHaveBeenCalledWith(processor);
    mediaDevices.videoInput.selected$ satisfies unknown;
  });

  it("closes the camera when its switch goes off and reopens it when on", async () => {
    const { media, vm, muteStates } = setup();
    await flushPromises();

    muteStates.video.setEnabled$.value?.(false);
    await flushPromises();
    expect(media.release).toHaveBeenCalledWith("camera");
    expect(vm.videoTrack$.value).toBeNull();

    muteStates.video.setEnabled$.value?.(true);
    await flushPromises();
    expect(media.capture).toHaveBeenLastCalledWith([
      expect.objectContaining({ source: "camera" }),
    ]);
    expect(vm.videoTrack$.value?.source).toBe("camera");
  });

  it("mutes the microphone in place", async () => {
    const { media, muteStates } = setup();
    await flushPromises();
    const microphone = media.tracks$.value.find(
      (t) => t.source === "microphone",
    )!;

    muteStates.audio.setEnabled$.value?.(false);
    await flushPromises();

    expect(microphone.setEnabled).toHaveBeenCalledWith(false);
    expect(media.release).not.toHaveBeenCalled();
    expect(muteStates.audio.enabled$.value).toBe(false);
  });

  it("leaves both switches off where the devices cannot be opened", async () => {
    const { muteStates } = setup(async () =>
      Promise.reject(new Error("NotAllowedError")),
    );
    await flushPromises();

    expect(muteStates.audio.enabled$.value).toBe(false);
    expect(muteStates.video.enabled$.value).toBe(false);
  });
});

const processor = { name: "blur" } as VideoProcessor;

function setup(
  capture: (
    requests: PublishRequest[],
  ) => Promise<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]> = async (
    requests,
  ) => Promise.resolve(requests.map(fakeTrack)),
): {
  media: LocalMedia;
  vm: ReturnType<typeof createLobbyMediaViewModel>;
  muteStates: MuteStates;
  mediaDevices: MediaDevices;
} {
  const scope = testScope();
  const tracks$ = new BehaviorSubject<
    (LocalAudioMediaTrack | LocalVideoMediaTrack)[]
  >([]);
  const media: LocalMedia = {
    requests: [],
    tracks$,
    capture: vi.fn(async (requests: PublishRequest[]) => {
      const tracks = await capture(requests);
      tracks$.next([
        ...tracks$.value.filter(
          (t) => !tracks.some((n) => n.source === t.source),
        ),
        ...tracks,
      ]);
      return tracks;
    }),
    release: vi.fn((source) =>
      tracks$.next(tracks$.value.filter((t) => t.source !== source)),
    ),
    stop: vi.fn(),
    takeTracks: () => new Map(),
  };
  const mediaDevices = mockMediaDevices({
    audioInput: device("mic"),
    videoInput: device("cam"),
  } as Partial<MediaDevices>);
  const muteStates = new MuteStates(
    scope,
    mediaDevices,
    { audioEnabled: true, videoEnabled: true },
    nullHostBridge,
  );
  const vm = createLobbyMediaViewModel(
    scope,
    media,
    muteStates,
    mediaDevices,
    {},
    constant(processor),
  );
  return { media, vm, muteStates, mediaDevices };
}

function device(id: string): unknown {
  return {
    available$: of(new Map([[id, { type: "name", name: id }]])),
    selected$: new BehaviorSubject({ id }),
    select: (): void => {},
  };
}

function fakeTrack(
  request: PublishRequest,
): LocalAudioMediaTrack | LocalVideoMediaTrack {
  const muted$ = new BehaviorSubject(false);
  return {
    source: request.source,
    kind: request.source === "microphone" ? "audio" : "video",
    id: request.source,
    muted$,
    setEnabled: vi.fn(async (enabled: boolean) => {
      muted$.next(!enabled);
      return Promise.resolve(enabled);
    }),
    setDevice: vi.fn(async () => Promise.resolve()),
    setProcessor: vi.fn(async () => Promise.resolve()),
  } as unknown as LocalAudioMediaTrack | LocalVideoMediaTrack;
}
