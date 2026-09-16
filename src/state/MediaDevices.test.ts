/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";

const getPlatform = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return getPlatform();
  },
  isFirefox: (): boolean => false,
}));
// One observer per device kind, so a test can add and remove hardware.
const observers = vi.hoisted(
  () => new Map<string, { next: (devices: unknown[]) => void }>(),
);
vi.mock("@livekit/components-core", async () => {
  const { BehaviorSubject: Subject } = await import("rxjs");
  return {
    createMediaDeviceObserver: (kind: string) => {
      let observer = observers.get(kind);
      if (observer === undefined) {
        observer = new Subject<unknown[]>([]);
        observers.set(kind, observer);
      }
      return observer;
    },
  };
});

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

function device(deviceId: string, label: string, groupId = deviceId): object {
  return { deviceId, label, groupId, kind: "audioinput" };
}

/** Replaces the hardware of one kind, as the browser would report it. */
function setDevices(kind: string, devices: object[]): void {
  const observer = observers.get(kind);
  if (observer === undefined) throw new Error(`nothing observing ${kind}`);
  observer.next(devices);
}

function newMediaDevices(): MediaDevices {
  return new MediaDevices(new ObservableScope(), {
    controlledAudioDevices: false,
  });
}

describe("MediaDevices selection", () => {
  afterEach(() => {
    localStorage.clear();
    for (const kind of observers.keys()) setDevices(kind, []);
  });

  test("persists the selected device across sessions", () => {
    const devices = newMediaDevices();
    setDevices("audioinput", [
      device("mic1", "Microphone 1"),
      device("mic2", "Microphone 2"),
    ]);

    devices.audioInput.select("mic2");

    // A later call on the same machine reads the same stored preference.
    expect(newMediaDevices().audioInput.selected$.value?.id).toBe("mic2");
  });

  test("updates the available devices when hardware changes", () => {
    const devices = newMediaDevices();
    setDevices("audioinput", [device("mic1", "Microphone 1")]);
    expect([...devices.audioInput.available$.value.keys()]).toEqual(["mic1"]);

    // A headset is plugged in.
    setDevices("audioinput", [
      device("mic1", "Microphone 1"),
      device("mic2", "Headset"),
    ]);
    expect([...devices.audioInput.available$.value.keys()]).toEqual([
      "mic1",
      "mic2",
    ]);

    // And unplugged again.
    setDevices("audioinput", [device("mic1", "Microphone 1")]);
    expect([...devices.audioInput.available$.value.keys()]).toEqual(["mic1"]);
  });

  test("falls back to the default device when the selected device disappears", () => {
    const devices = newMediaDevices();
    setDevices("audioinput", [
      device("mic1", "Microphone 1"),
      device("mic2", "Headset"),
    ]);
    devices.audioInput.select("mic2");
    expect(devices.audioInput.selected$.value?.id).toBe("mic2");

    // The headset is unplugged mid-call.
    setDevices("audioinput", [device("mic1", "Microphone 1")]);

    expect(devices.audioInput.selected$.value?.id).toBe("mic1");
  });

  test("falls back when the remembered device is absent", () => {
    const devices = newMediaDevices();
    setDevices("audioinput", [device("mic1", "Microphone 1")]);
    // Remembered from a previous call, on hardware that is not here now.
    devices.audioInput.select("a-device-from-last-time");

    expect(devices.audioInput.selected$.value?.id).toBe("mic1");
  });

  test("falls back to numbered labels when labels are unavailable", () => {
    const devices = newMediaDevices();
    // The browser withholds names until permission has been granted.
    setDevices("audioinput", [device("mic1", ""), device("mic2", "")]);

    expect([...devices.audioInput.available$.value.values()]).toEqual([
      { type: "number", number: 1 },
      { type: "number", number: 2 },
    ]);
  });

  test("lists Default as a distinct entry", () => {
    const devices = newMediaDevices();
    setDevices("audiooutput", [device("spk1", "Speakers")]);

    const available = devices.audioOutput.available$.value;
    // Default follows the operating system and re-points when it changes, so
    // it is its own choice rather than an alias for the device it resolves to.
    expect(available.get("spk1")).toEqual({ type: "name", name: "Speakers" });
    expect(available.get("")).toEqual({ type: "default", name: "Speakers" });
  });

  test("selecting one device kind leaves the others unchanged", () => {
    const devices = newMediaDevices();
    setDevices("audioinput", [
      device("mic1", "Microphone 1"),
      device("mic2", "Headset"),
    ]);
    setDevices("audiooutput", [
      device("spk1", "Speakers"),
      device("spk2", "Headset"),
    ]);
    setDevices("videoinput", [device("cam1", "Camera 1")]);

    devices.audioOutput.select("spk2");
    const audioInputBefore = devices.audioInput.selected$.value?.id;
    const videoInputBefore = devices.videoInput.selected$.value?.id;

    devices.audioInput.select("mic2");

    expect(devices.audioOutput.selected$.value?.id).toBe("spk2");
    expect(devices.videoInput.selected$.value?.id).toBe(videoInputBefore);
    expect(audioInputBefore).not.toBe("mic2");
    expect(devices.audioInput.selected$.value?.id).toBe("mic2");
  });
});
