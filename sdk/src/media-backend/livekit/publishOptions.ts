/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioCaptureOptions,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from "livekit-client";

import {
  type PublishRequest,
  type VideoCaptureSettings,
} from "../../media-api";

export type PublishRequestFor<S extends PublishRequest["source"]> = Extract<
  PublishRequest,
  { source: S }
>;

/** LiveKit fills in the room defaults for whatever a request leaves out. */
export function audioCaptureOptions({
  deviceId,
  capture,
}: PublishRequestFor<"microphone">): AudioCaptureOptions | undefined {
  if (deviceId === undefined && capture === undefined) return undefined;
  return { ...(deviceId && { deviceId }), ...capture };
}

export function videoCaptureOptions({
  deviceId,
  processor,
  capture,
}: PublishRequestFor<"camera">): VideoCaptureOptions | undefined {
  if (!deviceId && !processor && !capture?.resolution) return undefined;
  return {
    ...(deviceId && { deviceId }),
    ...(processor && { processor }),
    ...(capture?.resolution && { resolution: capture.resolution }),
  };
}

export function videoPublishOptions(
  settings: VideoCaptureSettings | undefined,
): TrackPublishOptions | undefined {
  if (settings === undefined) return undefined;
  return {
    ...(settings.maxBitrate !== undefined && {
      videoEncoding: {
        maxBitrate: settings.maxBitrate,
        maxFramerate: settings.maxFramerate,
      },
    }),
    ...(settings.codec && { videoCodec: settings.codec }),
  };
}

export function screenShareCaptureOptions({
  audio = true,
  capture,
}: PublishRequestFor<"screenShare">): ScreenShareCaptureOptions {
  return {
    // No echo cancellation: it would cancel the other members' voices out of
    // the shared audio
    audio: audio && {
      autoGainControl: false,
      noiseSuppression: false,
      voiceIsolation: false,
    },
    selfBrowserSurface: "include",
    surfaceSwitching: "include",
    systemAudio: "include",
    ...(capture?.resolution && { resolution: capture.resolution }),
  };
}

export function screenSharePublishOptions(
  settings: VideoCaptureSettings | undefined,
): TrackPublishOptions | undefined {
  if (settings === undefined) return undefined;
  return {
    ...(settings.maxBitrate !== undefined && {
      screenShareEncoding: {
        maxBitrate: settings.maxBitrate,
        maxFramerate: settings.maxFramerate,
      },
    }),
    ...(settings.codec && { videoCodec: settings.codec }),
  };
}
