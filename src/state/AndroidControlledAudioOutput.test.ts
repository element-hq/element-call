/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { it, vi, expect, beforeEach, afterEach, describe } from "vitest";
import { firstValueFrom, of, Subject, take, toArray } from "rxjs";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

import { AndroidControlledAudioOutput } from "./AndroidControlledAudioOutput.ts";
import type { Controls, OutputDevice } from "../controls";
import { ObservableScope } from "./ObservableScope";
import { withTestScheduler } from "../utils/test";

// All the following device types are real device types that have been observed in the wild on Android devices,
// gathered from logs.
// There are no BT Speakers because they are currently filtered out by EXA (native layer)

// A device type describing the speaker system (i.e. a mono speaker or stereo speakers) built in a device.
const SPEAKER_DEVICE: OutputDevice = {
  id: "3",
  name: "Built-in speaker",
  isEarpiece: false,
  isSpeaker: true,
  isExternalHeadset: false,
};

// A device type describing the attached earphone speaker.
const EARPIECE_DEVICE: OutputDevice = {
  id: "2",
  name: "Built-in earpiece",
  isEarpiece: true,
  isSpeaker: false,
  isExternalHeadset: false,
};

// A device type describing a Bluetooth device typically used for telephony
const BT_HEADSET_DEVICE: OutputDevice = {
  id: "2226",
  name: "Bluetooth - OpenMove by Shokz",
  isEarpiece: false,
  isSpeaker: false,
  isExternalHeadset: true,
};

// A device type describing a USB audio headset.
const USB_HEADSET_DEVICE: OutputDevice = {
  id: "29440",
  name: "USB headset - USB-Audio - AB13X USB Audio",
  isEarpiece: false,
  isSpeaker: false,
  isExternalHeadset: false,
};

// A device type describing a headset, which is the combination of a headphones and microphone
const WIRED_HEADSET_DEVICE: OutputDevice = {
  id: "54509",
  name: "Wired headset - 23117RA68G",
  isEarpiece: false,
  isSpeaker: false,
  isExternalHeadset: false,
};

// A device type describing a pair of wired headphones
const WIRED_HEADPHONE_DEVICE: OutputDevice = {
  id: "679",
  name: "Wired headphones - TB02",
  isEarpiece: false,
  isSpeaker: false,
  isExternalHeadset: false,
};

/**
 * The base device list that is always present on Android devices.
 * This list is ordered by the OS, the speaker is listed before the earpiece.
 */
const BASE_DEVICE_LIST = [SPEAKER_DEVICE, EARPIECE_DEVICE];

const BT_HEADSET_BASE_DEVICE_LIST = [BT_HEADSET_DEVICE, ...BASE_DEVICE_LIST];

const WIRED_HEADSET_BASE_DEVICE_LIST = [
  WIRED_HEADSET_DEVICE,
  ...BASE_DEVICE_LIST,
];

/**
 * A full device list containing all the observed device types in the wild on Android devices.
 * Ordered as they would be ordered by the OS.
 */
const FULL_DEVICE_LIST = [
  BT_HEADSET_DEVICE,
  USB_HEADSET_DEVICE,
  WIRED_HEADSET_DEVICE,
  WIRED_HEADPHONE_DEVICE,
  ...BASE_DEVICE_LIST,
];

let testScope: ObservableScope;
let mockControls: Controls;

beforeEach(() => {
  testScope = new ObservableScope();
  mockControls = {
    onAudioDeviceSelect: vi.fn(),
    onOutputDeviceSelect: vi.fn(),
  } as unknown as Controls;
});

afterEach(() => {
  testScope.end();
});

describe("Default selection", () => {
  it("Default to speaker for video calls", async () => {
    const controlledAudioOutput = new AndroidControlledAudioOutput(
      of(BASE_DEVICE_LIST),
      testScope,
      "video",
      mockControls,
    );

    const emissions = await firstValueFrom(
      controlledAudioOutput.selected$.pipe(take(1), toArray()),
    );

    expect(emissions).toEqual([
      { id: SPEAKER_DEVICE.id, virtualEarpiece: false },
    ]);

    [
      mockControls.onAudioDeviceSelect,
      mockControls.onOutputDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(SPEAKER_DEVICE.id);
    });
  });

  it("Default to earpiece for audio calls for base config", async () => {
    const controlledAudioOutput = new AndroidControlledAudioOutput(
      of(BASE_DEVICE_LIST),
      testScope,
      "audio",
      mockControls,
    );

    const emissions = await firstValueFrom(
      controlledAudioOutput.selected$.pipe(take(1), toArray()),
    );

    expect(emissions).toEqual([
      { id: EARPIECE_DEVICE.id, virtualEarpiece: false },
    ]);

    [
      mockControls.onAudioDeviceSelect,
      mockControls.onOutputDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(EARPIECE_DEVICE.id);
    });
  });

  ["audio", "video"].forEach((callIntent) => {
    it(`Default to BT headset for ${callIntent} calls if present`, async () => {
      const controlledAudioOutput = new AndroidControlledAudioOutput(
        of(BT_HEADSET_BASE_DEVICE_LIST),
        testScope,
        callIntent,
        mockControls,
      );

      const emissions = await firstValueFrom(
        controlledAudioOutput.selected$.pipe(take(1), toArray()),
      );

      expect(emissions).toEqual([
        { id: BT_HEADSET_DEVICE.id, virtualEarpiece: false },
      ]);

      [
        mockControls.onAudioDeviceSelect,
        mockControls.onOutputDeviceSelect,
      ].forEach((mockFn) => {
        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockFn).toHaveBeenCalledWith(BT_HEADSET_DEVICE.id);
      });
    });
  });

  ["audio", "video"].forEach((callIntent) => {
    it(`Default to wired headset for ${callIntent} calls if present`, async () => {
      const controlledAudioOutput = new AndroidControlledAudioOutput(
        of(WIRED_HEADSET_BASE_DEVICE_LIST),
        testScope,
        callIntent,
        mockControls,
      );

      const emissions = await firstValueFrom(
        controlledAudioOutput.selected$.pipe(take(1), toArray()),
      );

      expect(emissions).toEqual([
        { id: WIRED_HEADSET_DEVICE.id, virtualEarpiece: false },
      ]);

      expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledExactlyOnceWith(
        WIRED_HEADSET_DEVICE.id,
      );
      expect(mockControls.onOutputDeviceSelect).toHaveBeenCalledExactlyOnceWith(
        WIRED_HEADSET_DEVICE.id,
      );
    });
  });
});

describe("Test mappings", () => {
  it("Should map output device to correct AudioDeviceLabel", async () => {
    const controlledAudioOutput = new AndroidControlledAudioOutput(
      of(FULL_DEVICE_LIST),
      testScope,
      undefined,
      mockControls,
    );

    const availableDevices = await firstValueFrom(
      controlledAudioOutput.available$.pipe(take(1)),
    );

    expect(availableDevices).toEqual(
      new Map([
        [BT_HEADSET_DEVICE.id, { type: "name", name: BT_HEADSET_DEVICE.name }],
        [
          USB_HEADSET_DEVICE.id,
          { type: "name", name: USB_HEADSET_DEVICE.name },
        ],
        [
          WIRED_HEADSET_DEVICE.id,
          { type: "name", name: WIRED_HEADSET_DEVICE.name },
        ],
        [
          WIRED_HEADPHONE_DEVICE.id,
          { type: "name", name: WIRED_HEADPHONE_DEVICE.name },
        ],
        [SPEAKER_DEVICE.id, { type: "speaker" }],
        [EARPIECE_DEVICE.id, { type: "earpiece" }],
      ]),
    );
  });
});

describe("Test select a device", () => {
  it(`Switch to correct device`, () => {
    withTestScheduler(({ cold, schedule, expectObservable, flush }) => {
      const controlledAudioOutput = new AndroidControlledAudioOutput(
        cold("a", { a: FULL_DEVICE_LIST }),
        testScope,
        undefined,
        mockControls,
      );

      schedule("-abc", {
        a: () => controlledAudioOutput.select(EARPIECE_DEVICE.id),
        b: () => controlledAudioOutput.select(USB_HEADSET_DEVICE.id),
        c: () => controlledAudioOutput.select(SPEAKER_DEVICE.id),
      });

      expectObservable(controlledAudioOutput.selected$).toBe("abcd", {
        // virtualEarpiece is always false on android.
        // Initially the BT_HEADSET is selected.
        a: { id: BT_HEADSET_DEVICE.id, virtualEarpiece: false },
        b: { id: EARPIECE_DEVICE.id, virtualEarpiece: false },
        c: { id: USB_HEADSET_DEVICE.id, virtualEarpiece: false },
        d: { id: SPEAKER_DEVICE.id, virtualEarpiece: false },
      });

      flush();

      [
        mockControls.onOutputDeviceSelect,
        mockControls.onAudioDeviceSelect,
      ].forEach((mockFn) => {
        expect(mockFn).toHaveBeenCalledTimes(4);
        expect(mockFn).toHaveBeenNthCalledWith(1, BT_HEADSET_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(2, EARPIECE_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(3, USB_HEADSET_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(4, SPEAKER_DEVICE.id);
      });
    });
  });

  it(`manually switch then a bt headset is added`, () => {
    withTestScheduler(({ cold, schedule, expectObservable, flush }) => {
      const controlledAudioOutput = new AndroidControlledAudioOutput(
        cold("a--b", {
          a: BASE_DEVICE_LIST,
          b: BT_HEADSET_BASE_DEVICE_LIST,
        }),
        testScope,
        "audio",
        mockControls,
      );

      // Default was earpiece (audio call), let's switch to speaker
      schedule("-a--", {
        a: () => controlledAudioOutput.select(SPEAKER_DEVICE.id),
      });

      expectObservable(controlledAudioOutput.selected$).toBe("ab-c", {
        // virtualEarpiece is always false on android.
        // Initially the BT_HEADSET is selected.
        a: { id: EARPIECE_DEVICE.id, virtualEarpiece: false },
        b: { id: SPEAKER_DEVICE.id, virtualEarpiece: false },
        c: { id: BT_HEADSET_DEVICE.id, virtualEarpiece: false },
      });

      flush();

      [
        mockControls.onOutputDeviceSelect,
        mockControls.onAudioDeviceSelect,
      ].forEach((mockFn) => {
        expect(mockFn).toHaveBeenCalledTimes(3);
        expect(mockFn).toHaveBeenNthCalledWith(1, EARPIECE_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(2, SPEAKER_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(3, BT_HEADSET_DEVICE.id);
      });
    });
  });

  it(`Go back to the previously selected after the auto-switch device goes away`, () => {
    withTestScheduler(({ cold, schedule, expectObservable, flush }) => {
      const controlledAudioOutput = new AndroidControlledAudioOutput(
        cold("a--b-c", {
          a: BASE_DEVICE_LIST,
          b: BT_HEADSET_BASE_DEVICE_LIST,
          c: BASE_DEVICE_LIST,
        }),
        testScope,
        "audio",
        mockControls,
      );

      // Default was earpiece (audio call), let's switch to speaker
      schedule("-a---", {
        a: () => controlledAudioOutput.select(SPEAKER_DEVICE.id),
      });

      expectObservable(controlledAudioOutput.selected$).toBe("ab-c-d", {
        // virtualEarpiece is always false on android.
        // Initially the BT_HEADSET is selected.
        a: { id: EARPIECE_DEVICE.id, virtualEarpiece: false },
        b: { id: SPEAKER_DEVICE.id, virtualEarpiece: false },
        c: { id: BT_HEADSET_DEVICE.id, virtualEarpiece: false },
        d: { id: SPEAKER_DEVICE.id, virtualEarpiece: false },
      });

      flush();

      [
        mockControls.onOutputDeviceSelect,
        mockControls.onAudioDeviceSelect,
      ].forEach((mockFn) => {
        expect(mockFn).toHaveBeenCalledTimes(4);
        expect(mockFn).toHaveBeenNthCalledWith(1, EARPIECE_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(2, SPEAKER_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(3, BT_HEADSET_DEVICE.id);
        expect(mockFn).toHaveBeenNthCalledWith(4, SPEAKER_DEVICE.id);
      });
    });
  });
});

describe("Available device changes", () => {
  let availableSource$: Subject<OutputDevice[]>;

  const createAudioControlledOutput = (
    intent: RTCCallIntent,
  ): AndroidControlledAudioOutput => {
    return new AndroidControlledAudioOutput(
      availableSource$,
      testScope,
      intent,
      mockControls,
    );
  };

  beforeEach(() => {
    availableSource$ = new Subject<OutputDevice[]>();
  });

  it("When a BT headset is added, control should switch to use it", () => {
    createAudioControlledOutput("video");

    // Emit the base device list, the speaker should be selected
    availableSource$.next(BASE_DEVICE_LIST);
    // Initially speaker would be selected
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(SPEAKER_DEVICE.id);
    });

    // Emit a new device list with a BT device, the control should switch to it
    availableSource$.next([BT_HEADSET_DEVICE, ...BASE_DEVICE_LIST]);
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenLastCalledWith(BT_HEADSET_DEVICE.id);
    });
  });

  // Android does not set `isExternalHeadset` to true for wired headphones, so we can't test this case.'
  it.skip("When a wired headset is added, control should switch to use it", async () => {
    const controlledAudioOutput = createAudioControlledOutput("video");

    // Emit the base device list, the speaker should be selected
    availableSource$.next(BASE_DEVICE_LIST);

    await firstValueFrom(controlledAudioOutput.selected$.pipe(take(1)));
    // Initially speaker would be selected
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(SPEAKER_DEVICE.id);
    });

    // Emit a new device list with a wired headset, the control should switch to it
    availableSource$.next([WIRED_HEADPHONE_DEVICE, ...BASE_DEVICE_LIST]);
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenLastCalledWith(WIRED_HEADPHONE_DEVICE.id);
    });
  });

  it("When the active bt headset is removed on audio call, control should switch to earpiece", () => {
    createAudioControlledOutput("audio");

    // Emit the BT headset device list, the BT headset should be selected
    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    // Initially speaker would be selected
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(BT_HEADSET_DEVICE.id);
    });

    // Emit a new device list without the BT headset, the control should switch to the earpiece for
    // audio calls
    availableSource$.next(BASE_DEVICE_LIST);
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenLastCalledWith(EARPIECE_DEVICE.id);
    });
  });

  it("When the active bt headset is removed on video call, control should switch to speaker", () => {
    createAudioControlledOutput("video");

    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);

    // Initially bt headset would be selected
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(BT_HEADSET_DEVICE.id);
    });

    // Emit a new device list without the BT headset, the control should switch to speaker for video call
    availableSource$.next(BASE_DEVICE_LIST);
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenLastCalledWith(SPEAKER_DEVICE.id);
    });
  });

  it("Do not repeatidly set the same device", () => {
    createAudioControlledOutput("video");

    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);

    // Initially bt headset would be selected
    [
      mockControls.onOutputDeviceSelect,
      mockControls.onAudioDeviceSelect,
    ].forEach((mockFn) => {
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(BT_HEADSET_DEVICE.id);
    });
  });
});

describe("Scope management", () => {
  it("Should stop emitting when scope ends", () => {
    const aScope = new ObservableScope();
    const controlledAudioOutput = new AndroidControlledAudioOutput(
      of(BASE_DEVICE_LIST),
      aScope,
      undefined,
      mockControls,
    );

    expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledOnce();

    aScope.end();

    controlledAudioOutput.select(EARPIECE_DEVICE.id);

    expect(mockControls.onAudioDeviceSelect).not.toHaveBeenCalledTimes(2);
    expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledOnce();
  });

  it("Should stop updating when scope ends", () => {
    const aScope = new ObservableScope();
    const availableSource$ = new Subject<OutputDevice[]>();
    new AndroidControlledAudioOutput(
      availableSource$,
      aScope,
      undefined,
      mockControls,
    );

    availableSource$.next(BT_HEADSET_BASE_DEVICE_LIST);
    expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledOnce();
    expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledWith(
      BT_HEADSET_DEVICE.id,
    );

    aScope.end();

    availableSource$.next(BASE_DEVICE_LIST);

    expect(mockControls.onAudioDeviceSelect).not.toHaveBeenCalledTimes(2);
    // Should have been called only once with the initial BT_HEADSET_DEVICE.id
    expect(mockControls.onAudioDeviceSelect).toHaveBeenCalledOnce();
  });
});
