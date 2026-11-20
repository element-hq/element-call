/*
Copyright 2025-2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BehaviorSubject, NEVER, Subject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  type DeviceMuteRequest,
  type DeviceMuteState,
  type HostBridge,
  type HostRequest,
  nullHostBridge,
} from "../HostBridge";
import { MuteStates, MuteState } from "./MuteStates";
import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
  type MediaDevice,
  type SelectedAudioInputDevice,
  type SelectedAudioOutputDevice,
  type SelectedDevice,
} from "./MediaDevices";
import { constant } from "./Behavior";
import { ObservableScope } from "./ObservableScope";
import { flushPromises, mockMediaDevices } from "../utils/test";
import { initializeWidget } from "../widget";
initializeWidget();

const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../UrlParams", () => ({ getUrlParams }));

let testScope: ObservableScope;

beforeEach(() => {
  testScope = new ObservableScope();
});

afterEach(() => {
  testScope.end();
});

describe("MuteState", () => {
  test("should automatically mute if force mute is set", async () => {
    const forceMute$ = new BehaviorSubject<boolean>(false);

    const deviceStub = {
      available$: constant(
        new Map<string, DeviceLabel>([
          ["fbac11", { type: "name", name: "HD Camera" }],
        ]),
      ),
      selected$: constant({ id: "fbac11" }),
      select(): void {},
    } as unknown as MediaDevice<DeviceLabel, SelectedDevice>;

    const muteState = new MuteState(testScope, deviceStub, true, forceMute$);
    let lastEnabled: boolean = false;
    muteState.enabled$.subscribe((enabled) => {
      lastEnabled = enabled;
    });
    let setEnabled: ((enabled: boolean) => void) | null = null;
    muteState.setEnabled$.subscribe((setter) => {
      setEnabled = setter;
    });

    await flushPromises();

    setEnabled!(true);
    await flushPromises();
    expect(lastEnabled).toBe(true);

    // Now force mute
    forceMute$.next(true);
    await flushPromises();
    // Should automatically mute
    expect(lastEnabled).toBe(false);

    // Try to unmute can not work
    expect(setEnabled).toBeNull();

    // Disable force mute
    forceMute$.next(false);
    await flushPromises();

    // TODO I'd expect it to go back to previous state (enabled)
    // but actually it goes back to the initial state from construction (disabled)
    // Should go back to previous state (enabled)
    // Skip for now
    // expect(lastEnabled).toBe(true);

    // But yet it can be unmuted now
    expect(setEnabled).not.toBeNull();

    setEnabled!(true);
    await flushPromises();
    expect(lastEnabled).toBe(true);
  });

  test("should ignore toggle while syncing but still process set requests", async () => {
    const deviceStub = {
      available$: constant(
        new Map<string, DeviceLabel>([
          ["mic", { type: "name", name: "Microphone" }],
        ]),
      ),
      selected$: constant({ id: "mic" }),
      select(): void {},
    } as unknown as MediaDevice<DeviceLabel, SelectedDevice>;

    const muteState = new MuteState(
      testScope,
      deviceStub,
      false,
      constant(false),
    );

    const first = Promise.withResolvers<boolean>();
    const second = Promise.withResolvers<boolean>();
    const handler = vi
      .fn<(desired: boolean) => Promise<boolean>>()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    muteState.setHandler(handler);

    const syncingValues: boolean[] = [];
    muteState.syncing$.subscribe((syncing) => {
      syncingValues.push(syncing);
    });

    let setEnabled: ((enabled: boolean) => void) | null = null;
    muteState.setEnabled$.subscribe((setter) => {
      setEnabled = setter;
    });
    let toggle: (() => void) | null = null;
    muteState.toggle$.subscribe((toggleFn) => {
      toggle = toggleFn;
    });

    await flushPromises();

    // Start syncing by requesting unmute.
    toggle!();
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenNthCalledWith(1, true);

    // Toggle requests are ignored while syncing.
    toggle!();
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1);

    // setEnabled still updates latest desired state while syncing (push-to-talk).
    setEnabled!(false);
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1);

    first.resolve(true);
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(2, false);

    second.resolve(false);
    await flushPromises();
    expect(syncingValues).toContain(true);
    expect(syncingValues.at(-1)).toBe(false);
  });

  // The bug from issue #4403: we join a call without a lobby, and the browser
  // tells us about the camera only after the call has started.
  // 1. Start with no camera, with the camera set to be on by default.
  // 2. Set a handler, like the call does when it starts.
  // 3. The camera shows up.
  // The handler must be called with "on", so the call publishes the camera,
  // and the button must show "on" only after the handler is done.
  //
  // What it guards: the button and the real camera must never disagree. In
  // the bug the button jumped to "on" by itself and nobody told the call, so
  // the other side saw "Waiting for media". If someone changes how the
  // default is applied and forgets the handler again, this test fails.
  test("asks the handler for the default of a device listed after it was set", async () => {
    const available$ = new BehaviorSubject(new Map<string, DeviceLabel>());
    const muteState = new MuteState(
      testScope,
      aDevice(available$),
      true,
      constant(false),
    );
    const handler = vi.fn(async (desired: boolean) => Promise.resolve(desired));
    muteState.setHandler(handler);
    expect(muteState.enabled$.value).toBe(false);

    available$.next(aCamera);
    // On only once the handler has acted on it
    expect(muteState.enabled$.value).toBe(false);
    await flushPromises();

    expect(handler).toHaveBeenLastCalledWith(true);
    expect(muteState.enabled$.value).toBe(true);
    expect(muteState.syncing$.value).toBe(false);
  });

  // A camera that is unplugged and plugged back in during a call.
  // 1. Start with a camera, on by default, and set a handler.
  // 2. The camera goes away, then comes back.
  // The handler is told "off" when the camera goes away and is not called
  // again. The camera stays off: we must not turn on a camera that the user
  // may have turned off before.
  //
  // What it guards: a privacy problem the fix for #4403 could cause. The fix
  // sends the default "on" to the handler. If it did that every time a
  // camera shows up, replugging a camera (or leaving earpiece mode) would
  // start sending video without the user asking. This test fails if the
  // default is ever applied a second time during a call.
  test("leaves a device that comes back under a handler off", async () => {
    const available$ = new BehaviorSubject(aCamera);
    const muteState = new MuteState(
      testScope,
      aDevice(available$),
      true,
      constant(false),
    );
    expect(muteState.enabled$.value).toBe(true);
    const handler = vi.fn(async (desired: boolean) => Promise.resolve(desired));
    muteState.setHandler(handler);

    available$.next(new Map());
    available$.next(aCamera);
    await flushPromises();

    expect(handler.mock.calls).toEqual([[false]]);
    expect(muteState.enabled$.value).toBe(false);
  });

  // The lobby case, which must keep working as before: no handler is set.
  // 1. Start with no camera, with the camera set to be on by default.
  // 2. The camera shows up.
  // The button shows "on" right away, with no waiting.
  //
  // What it guards: the lobby and the join read the button's value at once
  // to decide which devices to open. If the fix for #4403 made the default
  // wait for a handler here too, the value would be "off" for a moment and
  // the lobby would open no camera. This test fails if that happens.
  test("assumes the default at once where no handler is set", () => {
    const available$ = new BehaviorSubject(new Map<string, DeviceLabel>());
    const muteState = new MuteState(
      testScope,
      aDevice(available$),
      true,
      constant(false),
    );

    available$.next(aCamera);

    expect(muteState.enabled$.value).toBe(true);
  });

  // A device list with one camera in it.
  const aCamera = new Map<string, DeviceLabel>([
    ["fbac11", { type: "name", name: "HD Camera" }],
  ]);

  // A fake camera whose device list the test can change while it runs.
  function aDevice(
    available$: BehaviorSubject<Map<string, DeviceLabel>>,
  ): MediaDevice<DeviceLabel, SelectedDevice> {
    return {
      available$,
      selected$: constant({ id: "fbac11" }),
      select(): void {},
    } as unknown as MediaDevice<DeviceLabel, SelectedDevice>;
  }
});

describe("MuteStates", () => {
  function aAudioOutputDevices(): MediaDevice<
    AudioOutputDeviceLabel,
    SelectedAudioOutputDevice
  > {
    const selected$ = new BehaviorSubject<
      SelectedAudioOutputDevice | undefined
    >({
      id: "default",
      virtualEarpiece: false,
    });
    return {
      available$: constant(
        new Map<string, AudioOutputDeviceLabel>([
          ["default", { type: "speaker" }],
          ["0000", { type: "speaker" }],
          ["1111", { type: "earpiece" }],
          ["222", { type: "name", name: "Bluetooth Speaker" }],
        ]),
      ),
      selected$,
      select(id: string): void {
        if (!this.available$.getValue().has(id)) {
          logger.warn(`Attempted to select unknown device id: ${id}`);
          return;
        }
        selected$.next({
          id,
          /** For test purposes we ignore this */
          virtualEarpiece: false,
        });
      },
    };
  }

  function aVideoInput(): MediaDevice<DeviceLabel, SelectedDevice> {
    const selected$ = new BehaviorSubject<SelectedDevice | undefined>(
      undefined,
    );
    return {
      available$: constant(
        new Map<string, DeviceLabel>([
          ["0000", { type: "name", name: "HD Camera" }],
          ["1111", { type: "name", name: "WebCam Pro" }],
        ]),
      ),
      selected$,
      select(id: string): void {
        if (!this.available$.getValue().has(id)) {
          logger.warn(`Attempted to select unknown device id: ${id}`);
          return;
        }
        selected$.next({ id });
      },
    };
  }

  function aAudioInput(): MediaDevice<DeviceLabel, SelectedAudioInputDevice> {
    return {
      available$: constant(
        new Map<string, DeviceLabel>([
          ["mic0", { type: "name", name: "Built-in Microphone" }],
        ]),
      ),
      selected$: constant({ id: "mic0", hardwareDeviceChange$: NEVER }),
      select(): void {},
    };
  }

  test("keeps the host informed and applies its mute requests", async () => {
    const deviceMute$ = new Subject<
      HostRequest<DeviceMuteRequest, DeviceMuteState>
    >();
    const notifyDeviceMute = vi.fn(async (): Promise<void> => {});
    const hostBridge: HostBridge = {
      ...nullHostBridge,
      notifyDeviceMute,
      deviceMute$,
    };
    const muteStates = new MuteStates(
      testScope,
      mockMediaDevices({
        audioInput: aAudioInput(),
        videoInput: aVideoInput(),
      }),
      { audioEnabled: true, videoEnabled: false },
      hostBridge,
    );
    await flushPromises();

    // The host hears the state we started in
    expect(notifyDeviceMute).toHaveBeenLastCalledWith({
      audio_enabled: true,
      video_enabled: false,
    });

    // The host asks for the camera on, saying nothing about the microphone,
    // which is left as it is
    const reply = vi.fn();
    deviceMute$.next({ data: { video_enabled: true }, reply });
    await flushPromises();
    expect(reply).toHaveBeenCalledExactlyOnceWith({
      audio_enabled: true,
      video_enabled: true,
    });
    expect(muteStates.audio.enabled$.value).toBe(true);
    expect(muteStates.video.enabled$.value).toBe(true);
    expect(notifyDeviceMute).toHaveBeenLastCalledWith({
      audio_enabled: true,
      video_enabled: true,
    });

    // Then for everything off
    const replyAgain = vi.fn();
    deviceMute$.next({
      data: { audio_enabled: false, video_enabled: false },
      reply: replyAgain,
    });
    await flushPromises();
    expect(replyAgain).toHaveBeenCalledExactlyOnceWith({
      audio_enabled: false,
      video_enabled: false,
    });
    expect(muteStates.audio.enabled$.value).toBe(false);
    expect(muteStates.video.enabled$.value).toBe(false);
    expect(notifyDeviceMute).toHaveBeenLastCalledWith({
      audio_enabled: false,
      video_enabled: false,
    });
  });

  test("should mute camera when in earpiece mode", async () => {
    const audioOutputDevice = aAudioOutputDevices();

    const mediaDevices = mockMediaDevices({
      audioOutput: audioOutputDevice,
      videoInput: aVideoInput(),
      // other devices are not relevant for this test
    });
    const muteStates = new MuteStates(
      testScope,
      mediaDevices,
      { audioEnabled: false, videoEnabled: false },
      nullHostBridge,
    );

    let latestSyncedState: boolean | null = null;
    muteStates.video.setHandler(async (enabled: boolean): Promise<boolean> => {
      logger.info(`Video mute state set to: ${enabled}`);
      latestSyncedState = enabled;
      return Promise.resolve(enabled);
    });

    let lastVideoEnabled: boolean = false;
    muteStates.video.enabled$.subscribe((enabled) => {
      lastVideoEnabled = enabled;
    });

    expect(muteStates.video.setEnabled$.value).toBeDefined();
    muteStates.video.setEnabled$.value?.(true);
    await flushPromises();

    expect(lastVideoEnabled).toBe(true);

    // Select earpiece audio output
    audioOutputDevice.select("1111");
    await flushPromises();
    // Video should be automatically muted
    expect(lastVideoEnabled).toBe(false);
    expect(latestSyncedState).toBe(false);

    // Try to switch to speaker
    audioOutputDevice.select("0000");
    await flushPromises();
    // TODO I'd expect it to go back to previous state (enabled)??
    // But maybe not? If you move the phone away from your ear you may not want it
    // to automatically enable video?
    expect(lastVideoEnabled).toBe(false);

    // But yet it can be unmuted now
    expect(muteStates.video.setEnabled$.value).toBeDefined();
    muteStates.video.setEnabled$.value?.(true);
    await flushPromises();
    expect(lastVideoEnabled).toBe(true);
  });
});
