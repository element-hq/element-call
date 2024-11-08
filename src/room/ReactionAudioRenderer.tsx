/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { ReactNode, useEffect, useRef } from "react";

import { useReactions } from "../useReactions";
import {
  playReactionsSound,
  soundEffectVolumeSetting as effectSoundVolumeSetting,
  useSetting,
} from "../settings/settings";
import { GenericReaction, ReactionSet } from "../reactions";

export function ReactionsAudioRenderer(): ReactNode {
  const { reactions } = useReactions();
  const [shouldPlay] = useSetting(playReactionsSound);
  const [effectSoundVolume] = useSetting(effectSoundVolumeSetting);
  const audioElements = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    if (!audioElements.current) {
      return;
    }

    if (!shouldPlay) {
      return;
    }
    for (const reactionName of new Set(
      Object.values(reactions).map((r) => r.name),
    )) {
      const audioElement =
        audioElements.current[reactionName] ?? audioElements.current.generic;
      if (audioElement?.paused) {
        audioElement.volume = effectSoundVolume;
        void audioElement.play();
      }
    }
  }, [audioElements, shouldPlay, reactions, effectSoundVolume]);

  // Do not render any audio elements if playback is disabled. Will save
  // audio file fetches.
  if (!shouldPlay) {
    return null;
  }

  // NOTE: We load all audio elements ahead of time to allow the cache
  // to be populated, rather than risk a cache miss and have the audio
  // be delayed.
  return (
    <>
      {[GenericReaction, ...ReactionSet].map(
        (r) =>
          r.sound && (
            <audio
              ref={(el) => (audioElements.current[r.name] = el)}
              data-testid={r.name}
              key={r.name}
              preload="auto"
              hidden
            >
              <source src={r.sound.ogg} type="audio/ogg; codecs=vorbis" />
              {r.sound.mp3 ? (
                <source src={r.sound.mp3} type="audio/mpeg" />
              ) : null}
            </audio>
          ),
      )}
    </>
  );
}
