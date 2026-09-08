/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, vi, it, expect } from "vitest";
import * as ComponentsCore from "@livekit/components-core";

import { ObservableScope } from "./ObservableScope";
import { MediaDevices } from "./MediaDevices";
import { audioInput as audioInputSetting } from "../settings/settings";
import { withTestScheduler } from "../utils/test";

const BUILT_IN_MIC = {
  deviceId: "b3d4cb5e0c8e1d7a2f9b6c4e5d8a7f1c3e2b9d6a5c4f8e7d1b2a3c4d5e6f7a8b",
  kind: "audioinput",
  label: "iPhone Microphone",
  groupId: "1",
} as unknown as MediaDeviceInfo;

const HEADSET_MIC = {
  deviceId: "c4e5d6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
  kind: "audioinput",
  label: "Headset Microphone",
  groupId: "2",
} as unknown as MediaDeviceInfo;

// Chrome exposes a synthetic "default" device that follows the OS default.
const CHROME_DEFAULT = {
  ...HEADSET_MIC,
  deviceId: "default",
  label: `Default - ${HEADSET_MIC.label}`,
} as unknown as MediaDeviceInfo;

vi.mock("@livekit/components-core", () => ({
  createMediaDeviceObserver: vi.fn(),
}));

describe("AudioInput", () => {
  let testScope: ObservableScope;

  beforeEach(() => {
    testScope = new ObservableScope();
    // Device preferences persist in localStorage across tests
    audioInputSetting.setValue(undefined);
  });

  afterEach(() => {
    testScope.end();
  });

  it("uses the browser default input when there is no default pseudo-device", () => {
    withTestScheduler(({ behavior, cold, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        // iOS / Firefox: physical devices only, built-in first
        cold("a", { a: [BUILT_IN_MIC, HEADSET_MIC] }),
      );

      const { audioInput } = new MediaDevices(testScope);

      expectObservable(audioInput.available$).toBe("a", {
        a: new Map([
          ["", { type: "default", name: null }],
          [BUILT_IN_MIC.deviceId, { type: "name", name: BUILT_IN_MIC.label }],
          [HEADSET_MIC.deviceId, { type: "name", name: HEADSET_MIC.label }],
        ]),
      });
      expectObservable(audioInput.selected$.pipe()).toBe("a", {
        a: expect.objectContaining({ id: "" }),
      });
    });
  });

  it("keeps using Chrome's default device", () => {
    withTestScheduler(({ behavior, cold, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        cold("a", { a: [CHROME_DEFAULT, BUILT_IN_MIC, HEADSET_MIC] }),
      );

      const { audioInput } = new MediaDevices(testScope);

      expectObservable(audioInput.selected$).toBe("a", {
        a: expect.objectContaining({ id: "default" }),
      });
    });
  });

  it("honours an explicit choice and falls back to the browser default when it disappears", () => {
    withTestScheduler(({ behavior, cold, schedule, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        cold("a---b", {
          a: [BUILT_IN_MIC, HEADSET_MIC],
          b: [BUILT_IN_MIC],
        }),
      );

      const { audioInput } = new MediaDevices(testScope);

      schedule("--a", { a: () => audioInput.select(HEADSET_MIC.deviceId) });

      expectObservable(audioInput.selected$).toBe("a-b-c", {
        a: expect.objectContaining({ id: "" }),
        b: expect.objectContaining({ id: HEADSET_MIC.deviceId }),
        c: expect.objectContaining({ id: "" }),
      });
    });
  });
});
