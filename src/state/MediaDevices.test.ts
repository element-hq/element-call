/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { of } from "rxjs";

const getPlatform = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return getPlatform();
  },
  isFirefox: (): boolean => false,
}));
vi.mock("@livekit/components-core", () => ({
  createMediaDeviceObserver: () => of([]),
}));

import { AudioOutput, MediaDevices } from "./MediaDevices";
import { AndroidControlledAudioOutput } from "./AndroidControlledAudioOutput";
import { IOSControlledAudioOutput } from "./IOSControlledAudioOutput";
import { ObservableScope } from "./ObservableScope";

// Which audio output implementation is used is decided by what the app hosting
// Element Call told it, rather than being discovered from the environment.
describe("MediaDevices audio output", () => {
  test("uses the browser's own output when nobody else is controlling it", () => {
    const devices = new MediaDevices(new ObservableScope(), {
      controlledAudioDevices: false,
    });

    expect(devices.audioOutput).toBeInstanceOf(AudioOutput);
  });

  test("hands control to the host on Android", () => {
    getPlatform.mockReturnValue("android");

    const devices = new MediaDevices(new ObservableScope(), {
      controlledAudioDevices: true,
      callIntent: "audio",
    });

    expect(devices.audioOutput).toBeInstanceOf(AndroidControlledAudioOutput);
  });

  test("hands control to the host elsewhere too", () => {
    getPlatform.mockReturnValue("ios");

    const devices = new MediaDevices(new ObservableScope(), {
      controlledAudioDevices: true,
      callIntent: "video",
    });

    expect(devices.audioOutput).toBeInstanceOf(IOSControlledAudioOutput);
  });
});
