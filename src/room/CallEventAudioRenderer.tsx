/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useEffect } from "react";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import joinCallSoundMp3 from "../sound/join_call.mp3";
import joinCallSoundOgg from "../sound/join_call.ogg";
import leftCallSoundMp3 from "../sound/left_call.mp3";
import leftCallSoundOgg from "../sound/left_call.ogg";
import handSoundOgg from "../sound/raise_hand.ogg";
import handSoundMp3 from "../sound/raise_hand.mp3";
import screenShareStartedOgg from "../sound/screen_share_started.ogg";
import screenShareStartedMp3 from "../sound/screen_share_started.mp3";
import declineMp3 from "../sound/call_declined.mp3?url";
import declineOgg from "../sound/call_declined.ogg?url";
import timeoutMp3 from "../sound/call_timeout.mp3?url";
import timeoutOgg from "../sound/call_timeout.ogg?url";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { useLatest } from "../useLatest";

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
  screenshareStarted: {
    mp3: screenShareStartedMp3,
    ogg: screenShareStartedOgg,
  },
  decline: {
    mp3: declineMp3,
    ogg: declineOgg,
  },
  timeout: {
    mp3: timeoutMp3,
    ogg: timeoutOgg,
  },
});

export type CallEventSounds = keyof Awaited<typeof callEventAudioSounds>;

export function CallEventAudioRenderer({
  vm,
  muted,
}: {
  vm: CallViewModel;
  muted?: boolean;
}): ReactNode {
  const audioEngineCtx = useAudioContext({
    sounds: callEventAudioSounds,
    latencyHint: "interactive",
    muted,
  });
  const audioEngineRef = useLatest(audioEngineCtx);

  useEffect(() => {
    const joinSub = vm.joinSoundEffect$.subscribe(
      () => void audioEngineRef.current?.playSound("join"),
    );
    const leftSub = vm.leaveSoundEffect$.subscribe(
      () => void audioEngineRef.current?.playSound("left"),
    );
    const handRaisedSub = vm.newHandRaised$.subscribe(
      () => void audioEngineRef.current?.playSound("raiseHand"),
    );
    const screenshareSub = vm.newScreenShare$.subscribe(
      () => void audioEngineRef.current?.playSound("screenshareStarted"),
    );

    return (): void => {
      joinSub.unsubscribe();
      leftSub.unsubscribe();
      handRaisedSub.unsubscribe();
      screenshareSub.unsubscribe();
    };
  }, [audioEngineRef, vm]);

  return <></>;
}
