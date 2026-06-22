/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, vi, it } from "vitest";
import * as ComponentsCore from "@livekit/components-core";

import { ObservableScope } from "./ObservableScope";
import { AudioOutput } from "./MediaDevices";
import { withTestScheduler } from "../utils/test";

const BT_SPEAKER = {
  deviceId: "f9fc8f5f94578fe3abd89e086c1e78c08477aa564dd9e917950f0e7ebb37a6a2",
  kind: "audiooutput",
  label: "JBL (Bluetooth)",
  groupId: "309a5c086cd8eb885a164046db6ec834c349be01d86448d02c1a5279456ff9e4",
} as unknown as MediaDeviceInfo;

const BUILT_IN_SPEAKER = {
  deviceId: "acdbb8546ea6fa85ba2d861e9bcc0e71810d03bbaf6d1712c69e8d9c0c6c2e0a",
  kind: "audiooutput",
  label: "MacBook Speakers (Built-in)",
  groupId: "08a5a3a486473aaa898eb81cda3113f3e21053fb8b84155f4e612fe3f8db5d17",
} as unknown as MediaDeviceInfo;

const BT_HEADSET = {
  deviceId: "ff8e6edb4ebb512b2b421335bfd14994a5b4c7192b3e84a8696863d83cf46d12",
  kind: "audiooutput",
  label: "OpenMove (Bluetooth)",
  groupId: "c2893c2438c44248368e0533300245c402764991506f42cd73818dc8c3ee9c88",
} as unknown as MediaDeviceInfo;

const AMAC_DEVICE_LIST = [BT_SPEAKER, BUILT_IN_SPEAKER];

const AMAC_DEVICE_LIST_WITH_DEFAULT = [
  asDefault(BUILT_IN_SPEAKER),
  ...AMAC_DEVICE_LIST,
];

const AMAC_HS_DEVICE_LIST = [
  asDefault(BT_HEADSET),
  BT_SPEAKER,
  BT_HEADSET,
  BUILT_IN_SPEAKER,
];

const LAPTOP_SPEAKER = {
  deviceId: "EcUxTMu8He2wz+3Y8m/u0fy6M92pUk=",
  kind: "audiooutput",
  label: "Raptor AVS Speaker",
  groupId: "kSrdanhpEDLg3vN8z6Z9MJ1EdanB8zI+Q1dxA=",
} as unknown as MediaDeviceInfo;

const MONITOR_SPEAKER = {
  deviceId: "gBryZdAdC8I/rrJpr9r6R+rZzKkoIK5cpU=",
  kind: "audiooutput",
  label: "Raptor AVS HDMI / DisplayPort 1 Output",
  groupId: "kSrdanhpEDLg3vN8z6Z9MJ1EdanB8zI+Q1dxA=",
} as unknown as MediaDeviceInfo;

const DEVICE_LIST_B = [LAPTOP_SPEAKER, MONITOR_SPEAKER];

// On chrome, there is an additional synthetic device called "Default - <device name>",
// it represents what the OS default is now.
function asDefault(device: MediaDeviceInfo): MediaDeviceInfo {
  return {
    ...device,
    deviceId: "default",
    label: `Default - ${device.label}`,
  };
}
// When the authorization is not yet granted, every device is still listed
// but only with empty/blank labels and ids.
// This is a transition state.
function toBlankDevice(device: MediaDeviceInfo): MediaDeviceInfo {
  return {
    ...device,
    deviceId: "",
    label: "",
    groupId: "",
  };
}

vi.mock("@livekit/components-core", () => ({
  createMediaDeviceObserver: vi.fn(),
}));

describe("AudioOutput Tests", () => {
  let testScope: ObservableScope;

  beforeEach(() => {
    testScope = new ObservableScope();
  });

  afterEach(() => {
    testScope.end();
  });

  it("should select the default audio output device", () => {
    // In a real life setup there would be first a blanked list
    // then the real one.
    withTestScheduler(({ behavior, cold, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        cold("ab", {
          // In a real life setup there would be first a blanked list
          // then the real one.
          a: AMAC_DEVICE_LIST_WITH_DEFAULT.map(toBlankDevice),
          b: AMAC_DEVICE_LIST_WITH_DEFAULT,
        }),
      );

      const audioOutput = new AudioOutput(
        behavior("a", { a: true }),
        testScope,
      );

      expectObservable(audioOutput.selected$).toBe("ab", {
        a: undefined,
        b: { id: "default", virtualEarpiece: false },
      });
    });
  });

  it("Select the correct device when requested", () => {
    // In a real life setup there would be first a blanked list
    // then the real one.
    withTestScheduler(({ behavior, cold, schedule, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        cold("ab", {
          // In a real life setup there would be first a blanked list
          // then the real one.
          a: DEVICE_LIST_B.map(toBlankDevice),
          b: DEVICE_LIST_B,
        }),
      );

      const audioOutput = new AudioOutput(
        behavior("a", { a: true }),
        testScope,
      );

      schedule("--abc", {
        a: () => audioOutput.select(MONITOR_SPEAKER.deviceId),
        b: () => audioOutput.select(LAPTOP_SPEAKER.deviceId),
        c: () => audioOutput.select(MONITOR_SPEAKER.deviceId),
      });

      expectObservable(audioOutput.selected$).toBe("abcde", {
        a: undefined,
        b: { id: LAPTOP_SPEAKER.deviceId, virtualEarpiece: false },
        c: { id: MONITOR_SPEAKER.deviceId, virtualEarpiece: false },
        d: { id: LAPTOP_SPEAKER.deviceId, virtualEarpiece: false },
        e: { id: MONITOR_SPEAKER.deviceId, virtualEarpiece: false },
      });
    });
  });

  it("Test mappings", () => {
    // In a real life setup there would be first a blanked list
    // then the real one.
    withTestScheduler(({ behavior, cold, schedule, expectObservable }) => {
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        cold("a", {
          // In a real life setup there would be first a blanked list
          // then the real one.
          a: AMAC_HS_DEVICE_LIST,
        }),
      );

      const audioOutput = new AudioOutput(
        behavior("a", { a: true }),
        testScope,
      );

      const expectedMappings = new Map([
        [`default`, { type: "name", name: asDefault(BT_HEADSET).label }],
        [BT_SPEAKER.deviceId, { type: "name", name: BT_SPEAKER.label }],
        [BT_HEADSET.deviceId, { type: "name", name: BT_HEADSET.label }],
        [
          BUILT_IN_SPEAKER.deviceId,
          { type: "name", name: BUILT_IN_SPEAKER.label },
        ],
      ]);

      expectObservable(audioOutput.available$).toBe("a", {
        a: expectedMappings,
      });
    });
  });
});
