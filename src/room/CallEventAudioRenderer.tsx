/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useDeferredValue, useEffect, useMemo } from "react";
import { filter, interval, throttle } from "rxjs";

import { type CallViewModel } from "../state/CallViewModel";
import joinCallSoundMp3 from "../sound/join_call.mp3";
import joinCallSoundOgg from "../sound/join_call.ogg";
import leftCallSoundMp3 from "../sound/left_call.mp3";
import leftCallSoundOgg from "../sound/left_call.ogg";
import handSoundOgg from "../sound/raise_hand.ogg?url";
import handSoundMp3 from "../sound/raise_hand.mp3?url";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { useReactions } from "../useReactions";
import { useLatest } from "../useLatest";

// Do not play any sounds if the participant count has exceeded this
// number.
export const MAX_PARTICIPANT_COUNT_FOR_SOUND = 8;
export const THROTTLE_SOUND_EFFECT_MS = 500;

export const callEventAudioSounds = prefetchSounds({
  join: {
    mp3: joinCallSoundMp3,
    ogg: joinCallSoundOgg,
  },
  left: {
    mp3: leftCallSoundMp3,
    ogg: leftCallSoundOgg,
  },
  raiseHand: {
    mp3: handSoundMp3,
    ogg: handSoundOgg,
  },
});

export function CallEventAudioRenderer({
  vm,
}: {
  vm: CallViewModel;
}): ReactNode {
  const audioEngineCtx = useAudioContext({
    sounds: callEventAudioSounds,
    latencyHint: "interactive",
  });
  const audioEngineRef = useLatest(audioEngineCtx);

  const { raisedHands } = useReactions();
  const raisedHandCount = useMemo(
    () => Object.keys(raisedHands).length,
    [raisedHands],
  );
  const previousRaisedHandCount = useDeferredValue(raisedHandCount);

  useEffect(() => {
    if (audioEngineRef.current && previousRaisedHandCount < raisedHandCount) {
      void audioEngineRef.current.playSound("raiseHand");
    }
  }, [audioEngineRef, previousRaisedHandCount, raisedHandCount]);

  useEffect(() => {
    const joinSub = vm.memberChanges$
      .pipe(
        filter(
          ({ joined, ids }) =>
            ids.length <= MAX_PARTICIPANT_COUNT_FOR_SOUND && joined.length > 0,
        ),
        throttle(() => interval(THROTTLE_SOUND_EFFECT_MS)),
      )
      .subscribe(() => {
        void audioEngineRef.current?.playSound("join");
      });

    const leftSub = vm.memberChanges$
      .pipe(
        filter(
          ({ ids, left }) =>
            ids.length <= MAX_PARTICIPANT_COUNT_FOR_SOUND && left.length > 0,
        ),
        throttle(() => interval(THROTTLE_SOUND_EFFECT_MS)),
      )
      .subscribe(() => {
        void audioEngineRef.current?.playSound("left");
      });

    return (): void => {
      joinSub.unsubscribe();
      leftSub.unsubscribe();
    };
  }, [audioEngineRef, vm]);

  return <></>;
}
