/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vitest } from "vitest";
import { type FC } from "react";
import { render } from "@testing-library/react";
import { afterEach } from "node:test";
import userEvent from "@testing-library/user-event";

import { deviceStub, MediaDevicesContext } from "./livekit/MediaDevicesContext";
import { useAudioContext } from "./useAudioContext";
import { soundEffectVolumeSetting } from "./settings/settings";

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
      <button onClick={() => audioCtx.playSound("aSound")}>Valid sound</button>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any*/}
      <button onClick={() => audioCtx.playSound("not-valid" as any)}>
        Invalid sound
      </button>
    </>
  );
};

class MockAudioContext {
  public static testContext: MockAudioContext;

  public constructor() {
    MockAudioContext.testContext = this;
  }

  public gain = vitest.mocked(
    {
      connect: () => {},
      gain: {
        setValueAtTime: vitest.fn(),
      },
    },
    true,
  );

  public setSinkId = vitest.fn().mockResolvedValue(undefined);
  public decodeAudioData = vitest.fn().mockReturnValue(1);
  public createBufferSource = vitest.fn().mockReturnValue(
    vitest.mocked({
      connect: (v: unknown) => v,
      start: () => {},
    }),
  );
  public createGain = vitest.fn().mockReturnValue(this.gain);
  public close = vitest.fn().mockResolvedValue(undefined);
}

afterEach(() => {
  vitest.unstubAllGlobals();
});

test("can play a single sound", async () => {
  const user = userEvent.setup();
  vitest.stubGlobal("AudioContext", MockAudioContext);
  const { findByText } = render(<TestComponent />);
  await user.click(await findByText("Valid sound"));
  expect(
    MockAudioContext.testContext.createBufferSource,
  ).toHaveBeenCalledOnce();
});
test("will ignore sounds that are not registered", async () => {
  const user = userEvent.setup();
  vitest.stubGlobal("AudioContext", MockAudioContext);
  const { findByText } = render(<TestComponent />);
  await user.click(await findByText("Invalid sound"));
  expect(
    MockAudioContext.testContext.createBufferSource,
  ).not.toHaveBeenCalled();
});

test("will use the correct device", () => {
  vitest.stubGlobal("AudioContext", MockAudioContext);
  render(
    <MediaDevicesContext.Provider
      value={{
        audioInput: deviceStub,
        audioOutput: {
          selectedId: "chosen-device",
          available: [],
          select: () => {},
        },
        videoInput: deviceStub,
        startUsingDeviceNames: () => {},
        stopUsingDeviceNames: () => {},
      }}
    >
      <TestComponent />
    </MediaDevicesContext.Provider>,
  );
  expect(
    MockAudioContext.testContext.createBufferSource,
  ).not.toHaveBeenCalled();
  expect(MockAudioContext.testContext.setSinkId).toHaveBeenCalledWith(
    "chosen-device",
  );
});

test("will use the correct volume level", async () => {
  const user = userEvent.setup();
  vitest.stubGlobal("AudioContext", MockAudioContext);
  soundEffectVolumeSetting.setValue(0.33);
  const { findByText } = render(<TestComponent />);
  await user.click(await findByText("Valid sound"));
  expect(
    MockAudioContext.testContext.gain.gain.setValueAtTime,
  ).toHaveBeenCalledWith(0.33, 0);
});
