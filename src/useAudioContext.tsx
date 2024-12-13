/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import { useState, useEffect } from "react";

import {
  soundEffectVolumeSetting as effectSoundVolumeSetting,
  useSetting,
} from "./settings/settings";
import { useMediaDevices } from "./livekit/MediaDevicesContext";
import { type PrefetchedSounds } from "./soundUtils";

/**
 * Play a sound though a given AudioContext. Will take
 * care of connecting the correct buffer and gating
 * through gain.
 * @param volume The volume to play at.
 * @param ctx The context to play through.
 * @param buffer The buffer to play.
 * @returns A promise that resolves when the sound has finished playing.
 */
async function playSound(
  ctx: AudioContext,
  buffer: AudioBuffer,
  volume: number,
): Promise<void> {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain).connect(ctx.destination);
  const p = new Promise<void>((r) => src.addEventListener("ended", () => r()));
  src.start();
  return p;
}

interface Props<S extends string> {
  /**
   * The sounds to play. If no sounds should be played then
   * this can be set to null, which will prevent the audio
   * context from being created.
   */
  sounds: PrefetchedSounds<S> | null;
  latencyHint: AudioContextLatencyCategory;
}

interface UseAudioContext<S> {
  playSound(soundName: S): Promise<void>;
}

/**
 * Add an audio context which can be used to play
 * a set of preloaded sounds.
 * @param props
 * @returns Either an instance that can be used to play sounds, or null if not ready.
 */
export function useAudioContext<S extends string>(
  props: Props<S>,
): UseAudioContext<S> | null {
  const [effectSoundVolume] = useSetting(effectSoundVolumeSetting);
  const devices = useMediaDevices();
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [audioBuffers, setAudioBuffers] = useState<Record<S, AudioBuffer>>();

  useEffect(() => {
    const sounds = props.sounds;
    if (!sounds) {
      return;
    }
    const ctx = new AudioContext({
      // We want low latency for these effects.
      latencyHint: props.latencyHint,
    });

    // We want to clone the content of our preloaded
    // sound buffers into this context. The context may
    // close during this process, so it's okay if it throws.
    (async (): Promise<void> => {
      const buffers: Record<string, AudioBuffer> = {};
      for (const [name, buffer] of Object.entries<ArrayBuffer>(await sounds)) {
        const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
        buffers[name] = audioBuffer;
      }
      setAudioBuffers(buffers as Record<S, AudioBuffer>);
    })().catch((ex) => {
      logger.debug("Failed to setup audio context", ex);
    });

    setAudioContext(ctx);
    return (): void => {
      void ctx.close().catch((ex) => {
        logger.debug("Failed to close audio engine", ex);
      });
      setAudioContext(undefined);
    };
  }, [props.sounds, props.latencyHint]);

  // Update the sink ID whenever we change devices.
  useEffect(() => {
    if (audioContext && "setSinkId" in audioContext) {
      // https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId
      // @ts-expect-error - setSinkId doesn't exist yet in types, maybe because it's not supported everywhere.
      audioContext.setSinkId(devices.audioOutput.selectedId).catch((ex) => {
        logger.warn("Unable to change sink for audio context", ex);
      });
    }
  }, [audioContext, devices]);

  // Don't return a function until we're ready.
  if (!audioContext || !audioBuffers) {
    return null;
  }
  return {
    playSound: async (name): Promise<void> => {
      if (!audioBuffers[name]) {
        logger.debug(`Tried to play a sound that wasn't buffered (${name})`);
        return;
      }
      return playSound(audioContext, audioBuffers[name], effectSoundVolume);
    },
  };
}
