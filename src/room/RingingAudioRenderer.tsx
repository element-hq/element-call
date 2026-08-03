/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, type FC } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { type RingingMediaViewModel } from "../state/media/RingingMediaViewModel";
import { useBehavior } from "../useBehavior";
import { useInitial } from "../useInitial";
import { prefetchSounds } from "../soundUtils";
import ringtoneMp3 from "../sound/ringtone.mp3?url";
import ringtoneOgg from "../sound/ringtone.ogg?url";
import { type UseAudioContext, useAudioContext } from "../useAudioContext";
import { useLatest } from "../useLatest";

interface RingingAudioRendererProps {
  vm: RingingMediaViewModel | null;
  muted: boolean;
}

export const RingingAudioRenderer: FC<RingingAudioRendererProps> = ({
  vm,
  muted,
}) => {
  // Preload a waiting and decline sounds
  const sounds = useInitial(async () => {
    return prefetchSounds({
      ringtone: { mp3: ringtoneMp3, ogg: ringtoneOgg },
    });
  });
  const audio = useAudioContext({
    sounds,
    latencyHint: "interactive",
    muted,
  });

  return vm && <ActiveRingingAudioRenderer vm={vm} audio={audio} />;
};

interface ActiveRingingAudioRendererProps {
  vm: RingingMediaViewModel;
  audio: UseAudioContext<"ringtone"> | null;
}

const ActiveRingingAudioRenderer: FC<ActiveRingingAudioRendererProps> = ({
  vm,
  audio,
}) => {
  const audio_ = useLatest(audio);
  const pickupState = useBehavior(vm.pickupState$);

  // While ringing, loop the ringtone
  useEffect((): void | (() => void) => {
    if (pickupState === "ringing" && audio_.current) {
      const endSound = audio_.current.playSoundLooping(
        "ringtone",
        audio_.current.soundDuration["ringtone"] ?? 1,
      );
      return () => {
        void endSound().catch((e) => {
          logger.error("Failed to stop ringing sound", e);
        });
      };
    }
  }, [pickupState, audio_]);

  return null;
};
