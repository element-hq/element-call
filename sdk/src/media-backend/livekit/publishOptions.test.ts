/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  audioCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
  videoCaptureOptions,
  videoPublishOptions,
} from "./publishOptions";

describe("audioCaptureOptions", () => {
  it("leaves a bare request to the room defaults", () => {
    expect(audioCaptureOptions({ source: "microphone" })).toBeUndefined();
  });

  it("carries the device and the processing flags", () => {
    expect(
      audioCaptureOptions({
        source: "microphone",
        deviceId: "mic-1",
        capture: { echoCancellation: false, noiseSuppression: true },
      }),
    ).toEqual({
      deviceId: "mic-1",
      echoCancellation: false,
      noiseSuppression: true,
    });
  });

  it("drops an empty device id", () => {
    expect(
      audioCaptureOptions({
        source: "microphone",
        deviceId: "",
        capture: { autoGainControl: false },
      }),
    ).toEqual({ autoGainControl: false });
  });
});

describe("videoCaptureOptions", () => {
  it("leaves a request without device, processor or resolution to the room defaults", () => {
    expect(
      videoCaptureOptions({
        source: "camera",
        capture: { maxBitrate: 1_000_000 },
      }),
    ).toBeUndefined();
  });

  it("carries the device and the resolution, but not the encoding", () => {
    expect(
      videoCaptureOptions({
        source: "camera",
        deviceId: "cam-1",
        capture: {
          resolution: { width: 1920, height: 1080, frameRate: 60 },
          maxBitrate: 4_000_000,
        },
      }),
    ).toEqual({
      deviceId: "cam-1",
      resolution: { width: 1920, height: 1080, frameRate: 60 },
    });
  });
});

describe("videoPublishOptions", () => {
  it("is nothing without capture settings", () => {
    expect(videoPublishOptions(undefined)).toBeUndefined();
  });

  it("is empty for settings that only set the resolution", () => {
    expect(
      videoPublishOptions({ resolution: { width: 640, height: 360 } }),
    ).toEqual({});
  });

  it("maps the bitrate, framerate and codec to the encoding", () => {
    expect(
      videoPublishOptions({
        maxBitrate: 4_000_000,
        maxFramerate: 60,
        codec: "vp9",
      }),
    ).toEqual({
      videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 60 },
      videoCodec: "vp9",
    });
  });
});

describe("screenShareCaptureOptions", () => {
  it("captures the audio without processing by default", () => {
    expect(screenShareCaptureOptions({ source: "screenShare" })).toEqual({
      audio: {
        autoGainControl: false,
        noiseSuppression: false,
        voiceIsolation: false,
      },
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
      systemAudio: "include",
    });
  });

  it("leaves the audio out on request and carries the resolution", () => {
    expect(
      screenShareCaptureOptions({
        source: "screenShare",
        audio: false,
        capture: { resolution: { width: 1280, height: 720 } },
      }),
    ).toMatchObject({
      audio: false,
      resolution: { width: 1280, height: 720 },
    });
  });
});

describe("screenSharePublishOptions", () => {
  it("is nothing without capture settings", () => {
    expect(screenSharePublishOptions(undefined)).toBeUndefined();
  });

  it("maps the bitrate, framerate and codec to the screen share encoding", () => {
    expect(
      screenSharePublishOptions({
        maxBitrate: 5_000_000,
        maxFramerate: 15,
        codec: "av1",
      }),
    ).toEqual({
      screenShareEncoding: { maxBitrate: 5_000_000, maxFramerate: 15 },
      videoCodec: "av1",
    });
  });
});
