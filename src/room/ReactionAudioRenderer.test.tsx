/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest,
  type MockedFunction,
  type Mock,
} from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { act, type ReactNode } from "react";

import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import {
  playReactionsSound as playReactionsSoundSetting,
  soundEffectVolume as soundEffectVolumeSetting,
} from "../settings/settings";
import { useAudioContext } from "../useAudioContext";
import { GenericReaction, ReactionSet } from "../reactions";
import { prefetchSounds } from "../soundUtils";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import {
  alice,
  aliceRtcMember,
  bobRtcMember,
  local,
  localRtcMember,
} from "../utils/test-fixtures";

function TestComponent({ vm }: { vm: CallViewModel }): ReactNode {
  return (
    <TooltipProvider>
      <ReactionsAudioRenderer vm={vm} />
    </TooltipProvider>
  );
}

vitest.mock("livekit-client/e2ee-worker?worker");
vitest.mock("../useAudioContext");
vitest.mock("../soundUtils");

let playSound: Mock<
  NonNullable<ReturnType<typeof useAudioContext>>["playSound"]
>;

describe("ReactionAudioRenderer", () => {
  afterEach(() => {
    playReactionsSoundSetting.setValue(playReactionsSoundSetting.defaultValue);
    soundEffectVolumeSetting.setValue(soundEffectVolumeSetting.defaultValue);
  });
  beforeEach(() => {
    (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue(
      {
        sound: new ArrayBuffer(0),
      },
    );
    playSound = vitest.fn();
    (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue(
      {
        playSound,
        playSoundLooping: vitest.fn(),
        soundDuration: {},
      },
    );
  });
  afterAll(() => {
    vitest.restoreAllMocks();
  });

  it("preloads all audio elements", () => {
    const { vm } = getBasicCallViewModelEnvironment([local, alice]);
    playReactionsSoundSetting.setValue(true);
    render(<TestComponent vm={vm} />);
    expect(prefetchSounds).toHaveBeenCalledOnce();
  });

  it("will play an audio sound when there is a reaction", () => {
    const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
      local,
      alice,
    ]);
    playReactionsSoundSetting.setValue(true);
    render(<TestComponent vm={vm} />);

    // Find the first reaction with a sound effect
    const chosenReaction = ReactionSet.find((r) => !!r.sound);
    if (!chosenReaction) {
      throw Error(
        "No reactions have sounds configured, this test cannot succeed",
      );
    }
    act(() => {
      reactionsSubject$.next({
        [aliceRtcMember.deviceId]: {
          reactionOption: chosenReaction,
          expireAfter: new Date(0),
        },
      });
    });
    expect(playSound).toHaveBeenCalledWith(chosenReaction.name);
  });

  it("will play the generic audio sound when there is soundless reaction", () => {
    const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
      local,
      alice,
    ]);
    playReactionsSoundSetting.setValue(true);
    render(<TestComponent vm={vm} />);

    // Find the first reaction with a sound effect
    const chosenReaction = ReactionSet.find((r) => !r.sound);
    if (!chosenReaction) {
      throw Error(
        "No reactions have sounds configured, this test cannot succeed",
      );
    }
    act(() => {
      reactionsSubject$.next({
        [aliceRtcMember.deviceId]: {
          reactionOption: chosenReaction,
          expireAfter: new Date(0),
        },
      });
    });
    expect(playSound).toHaveBeenCalledWith(GenericReaction.name);
  });

  it("will play multiple audio sounds when there are multiple different reactions", () => {
    const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
      local,
      alice,
    ]);
    playReactionsSoundSetting.setValue(true);
    render(<TestComponent vm={vm} />);

    // Find the first reaction with a sound effect
    const [reaction1, reaction2] = ReactionSet.filter((r) => !!r.sound);
    if (!reaction1 || !reaction2) {
      throw Error(
        "No reactions have sounds configured, this test cannot succeed",
      );
    }
    act(() => {
      reactionsSubject$.next({
        [aliceRtcMember.deviceId]: {
          reactionOption: reaction1,
          expireAfter: new Date(0),
        },
        [bobRtcMember.deviceId]: {
          reactionOption: reaction2,
          expireAfter: new Date(0),
        },
        [localRtcMember.deviceId]: {
          reactionOption: reaction1,
          expireAfter: new Date(0),
        },
      });
    });
    expect(playSound).toHaveBeenCalledWith(reaction1.name);
    expect(playSound).toHaveBeenCalledWith(reaction2.name);
  });
});
