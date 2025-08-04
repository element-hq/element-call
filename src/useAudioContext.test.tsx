/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, vi, afterEach, beforeEach, test } from "vitest";
import { type FC } from "react";
import { render } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";

import { MediaDevicesContext } from "./MediaDevicesContext";
import { useAudioContext } from "./useAudioContext";
import { soundEffectVolume as soundEffectVolumeSetting } from "./settings/settings";
import { mockMediaDevices } from "./utils/test";
import { constant } from "./state/Behavior";

const staticSounds = Promise.resolve({
  aSound: new ArrayBuffer(0),
});

const TestComponent: FC = () => {
  const audioCtx = useAudioContext({
    sounds: staticSounds,
    latencyHint: "balanced",
  });
  if (!audioCtx) {
    return null;
  }
  return (
    <>
      <button onClick={() => void audioCtx.playSound("aSound")}>
        Valid sound
      </button>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any*/}
      <button onClick={() => void audioCtx.playSound("not-valid" as any)}>
        Invalid sound
      </button>
    </>
  );
};
const TestComponentWrapper: FC = () => {
  return (
    <BrowserRouter>
      <TestComponent />
    </BrowserRouter>
  );
};

const gainNode = vi.mocked(
  {
    connect: (node: AudioNode) => node,
    gain: {
      setValueAtTime: vi.fn(),
      value: 1,
    },
  },
  true,
);
const panNode = vi.mocked(
  {
    connect: (node: AudioNode) => node,
    pan: {
      setValueAtTime: vi.fn(),
      value: 0,
    },
  },
  true,
);
/**
 * A shared audio context test instance.
 * It can also be used to mock the `AudioContext` constructor in tests:
 * `vi.stubGlobal("AudioContext", () => testAudioContext);`
 */
export const testAudioContext = {
  gain: gainNode,
  pan: panNode,
  setSinkId: vi.fn().mockResolvedValue(undefined),
  decodeAudioData: vi.fn().mockReturnValue(1),
  createBufferSource: vi.fn().mockReturnValue(
    vi.mocked({
      connect: (v: unknown) => v,
      start: () => {},
      addEventListener: (_name: string, cb: () => void) => cb(),
    }),
  ),
  createGain: vi.fn().mockReturnValue(gainNode),
  createStereoPanner: vi.fn().mockReturnValue(panNode),
  close: vi.fn().mockResolvedValue(undefined),
};
export const TestAudioContextConstructor = vi.fn(() => testAudioContext);

let user: UserEvent;
beforeEach(() => {
  vi.stubGlobal("AudioContext", TestAudioContextConstructor);
  user = userEvent.setup();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("can play a single sound", async () => {
  const { findByText } = render(
    <MediaDevicesContext value={mockMediaDevices({})}>
      <TestComponentWrapper />
    </MediaDevicesContext>,
  );
  await user.click(await findByText("Valid sound"));
  expect(testAudioContext.createBufferSource).toHaveBeenCalledOnce();
});

test("will ignore sounds that are not registered", async () => {
  const { findByText } = render(
    <MediaDevicesContext value={mockMediaDevices({})}>
      <TestComponentWrapper />
    </MediaDevicesContext>,
  );
  await user.click(await findByText("Invalid sound"));
  expect(testAudioContext.createBufferSource).not.toHaveBeenCalled();
});

test("will use the correct device", () => {
  render(
    <MediaDevicesContext
      value={mockMediaDevices({
        audioOutput: {
          available$: constant(new Map<never, never>()),
          selected$: constant({ id: "chosen-device", virtualEarpiece: false }),
          select: () => {},
        },
      })}
    >
      <TestComponentWrapper />
    </MediaDevicesContext>,
  );
  expect(testAudioContext.createBufferSource).not.toHaveBeenCalled();
  expect(testAudioContext.setSinkId).toHaveBeenCalledWith("chosen-device");
});

test("will use the correct volume level", async () => {
  soundEffectVolumeSetting.setValue(0.33);
  const { findByText } = render(
    <MediaDevicesContext value={mockMediaDevices({})}>
      <TestComponentWrapper />
    </MediaDevicesContext>,
  );
  await user.click(await findByText("Valid sound"));
  expect(testAudioContext.gain.gain.setValueAtTime).toHaveBeenCalledWith(
    0.33,
    0,
  );
  expect(testAudioContext.pan.pan.setValueAtTime).toHaveBeenCalledWith(0, 0);
});

test("will use the pan if earpiece is selected", async () => {
  const { findByText } = render(
    <MediaDevicesContext
      value={mockMediaDevices({
        audioOutput: {
          available$: constant(new Map<never, never>()),
          selected$: constant({ id: "chosen-device", virtualEarpiece: true }),
          select: () => {},
        },
      })}
    >
      <TestComponentWrapper />
    </MediaDevicesContext>,
  );
  await user.click(await findByText("Valid sound"));
  expect(testAudioContext.pan.pan.setValueAtTime).toHaveBeenCalledWith(1, 0);

  expect(testAudioContext.gain.gain.setValueAtTime).toHaveBeenCalledWith(
    soundEffectVolumeSetting.getValue() * 0.1,
    0,
  );
});
