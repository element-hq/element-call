/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useDeferredValue, useEffect, useState } from "react";

import { useReactions } from "../useReactions";
import { playReactionsSound, useSetting } from "../settings/settings";
import { GenericReaction, ReactionSet } from "../reactions";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { useLatest } from "../useLatest";

const soundMap = Object.fromEntries([
  ...ReactionSet.filter((v) => v.sound !== undefined).map((v) => [
    v.name,
    v.sound!,
  ]),
  [GenericReaction.name, GenericReaction.sound],
]);

export function ReactionsAudioRenderer(): ReactNode {
  const { reactions } = useReactions();
  const [shouldPlay] = useSetting(playReactionsSound);
  const [soundCache, setSoundCache] = useState<ReturnType<
    typeof prefetchSounds
  > | null>(null);
  const audioEngineCtx = useAudioContext({
    sounds: soundCache,
    latencyHint: "interactive",
  });
  const audioEngineRef = useLatest(audioEngineCtx);
  const oldReactions = useDeferredValue(reactions);

  useEffect(() => {
    if (!shouldPlay || soundCache) {
      return;
    }
    // This is fine even if we load the component multiple times,
    // as the browser's cache should ensure once the media is loaded
    // once that future fetches come via the cache.
    setSoundCache(prefetchSounds(soundMap));
  }, [soundCache, shouldPlay]);

  useEffect(() => {
    if (!shouldPlay || !audioEngineRef.current) {
      return;
    }
    const oldReactionSet = new Set(
      Object.values(oldReactions).map((r) => r.name),
    );
    for (const reactionName of new Set(
      Object.values(reactions).map((r) => r.name),
    )) {
      if (oldReactionSet.has(reactionName)) {
        // Don't replay old reactions
        return;
      }
      if (soundMap[reactionName]) {
        void audioEngineRef.current.playSound(reactionName);
      } else {
        // Fallback sounds.
        void audioEngineRef.current.playSound("generic");
      }
    }
  }, [audioEngineRef, shouldPlay, oldReactions, reactions]);
  return null;
}
