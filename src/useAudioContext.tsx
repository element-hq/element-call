/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { useState, useEffect } from "react";
import { useObservableEagerState } from "observable-hooks";

import {
  soundEffectVolume as soundEffectVolumeSetting,
  useSetting,
} from "./settings/settings";
import { useEarpieceAudioConfig, useMediaDevices } from "./MediaDevicesContext";
import { type PrefetchedSounds } from "./soundUtils";
import { useUrlParams } from "./UrlParams";
import * as controls from "./controls";

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
  stereoPan: number,
  delayS = 0,
  abort?: AbortController,
): Promise<void> {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, 0);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(stereoPan, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  abort?.signal.addEventListener("abort", () => {
    src.disconnect();
  });
  const p = new Promise<void>((r) => src.addEventListener("ended", () => r()));
  src.connect(gain).connect(pan).connect(ctx.destination);
  controls.setPlaybackStarted();
  src.start(ctx.currentTime + delayS);
  return p;
}

/**
 * Play a sound though a given AudioContext, looping until stopped. Will take
 * care of connecting the correct buffer and gating
 * through gain.
 * @param volume The volume to play at.
 * @param ctx The context to play through.
 * @param buffer The buffer to play.
 * @returns A function used to end the sound. This function will return a promise when the sound has stopped.
 */
function playSoundLooping(
  ctx: AudioContext,
  buffer: AudioBuffer,
  volume: number,
  stereoPan: number,
  delayS?: number,
): () => Promise<void> {
  if (delayS === 0) {
    throw Error("Looping sounds must have a delay");
  }

  // Our audio loop
  let lastSoundPromise: Promise<void>;
  let nextSoundPromise: Promise<void>;
  let ac: AbortController | undefined;
  void (async (): Promise<void> => {
    ac = new AbortController();
    // Play a sound immediately
    lastSoundPromise = Promise.resolve();
    do {
      // Queue up the next sound.
      nextSoundPromise = playSound(ctx, buffer, volume, stereoPan, delayS, ac);
      // Await the previous sound.
      await lastSoundPromise;
      // Swap the promises over, and loop round to play the next sound.
      lastSoundPromise = nextSoundPromise;
    } while (!ac.signal.aborted);
  })();

  return async () => {
    ac?.abort();
    // Wait for sounds to finish.
    await lastSoundPromise;
    await nextSoundPromise;
  };
}

interface Props<S extends string> {
  /**
   * The sounds to play. If no sounds should be played then
   * this can be set to null, which will prevent the audio
   * context from being created.
   */
  sounds: PrefetchedSounds<S> | null;
  latencyHint: AudioContextLatencyCategory;
  muted?: boolean;
}

interface UseAudioContext<S extends string> {
  playSound(soundName: S): Promise<void>;
  playSoundLooping(soundName: S, delayS?: number): () => Promise<void>;
  /**
   * Map of sound name to duration in seconds.
   */
  soundDuration: Record<string, number>;
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
  const [soundEffectVolume] = useSetting(soundEffectVolumeSetting);
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

  const audioOutputId = useObservableEagerState(
    useMediaDevices().audioOutput.selected$,
  )?.id;
  const { controlledAudioDevices } = useUrlParams();

  // Update the sink ID whenever we change devices.
  useEffect(() => {
    if (
      audioContext &&
      "setSinkId" in audioContext &&
      !controlledAudioDevices
    ) {
      // https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId
      // @ts-expect-error - setSinkId doesn't exist yet in types, maybe because it's not supported everywhere.
      audioContext.setSinkId(audioOutputId).catch((ex) => {
        logger.warn("Unable to change sink for audio context", ex);
      });
    }
  }, [audioContext, audioOutputId, controlledAudioDevices]);
  const { pan: earpiecePan, volume: earpieceVolume } = useEarpieceAudioConfig();

  // Don't return a function until we're ready.
  if (!audioContext || !audioBuffers || props.muted) {
    return null;
  }

  return {
    playSound: async (name): Promise<void> => {
      if (!audioBuffers[name]) {
        logger.debug(`Tried to play a sound that wasn't buffered (${name})`);
        return;
      }
      return playSound(
        audioContext,
        audioBuffers[name],
        soundEffectVolume * earpieceVolume,
        earpiecePan,
      );
    },
    playSoundLooping: (name, delayS: number): (() => Promise<void>) => {
      if (!audioBuffers[name]) {
        throw Error(`Tried to play a sound that wasn't buffered (${name})`);
      }
      return playSoundLooping(
        audioContext,
        audioBuffers[name],
        soundEffectVolume * earpieceVolume,
        earpiecePan,
        delayS,
      );
    },
    soundDuration: Object.fromEntries(
      Object.entries(audioBuffers).map(([k, v]) => [
        k,
        (v as AudioBuffer).duration,
      ]),
    ),
  };
}
