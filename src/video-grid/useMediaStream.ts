/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useRef, useEffect, RefObject, useState, useCallback } from "react";
import {
  acquireContext,
  releaseContext,
} from "matrix-js-sdk/src/webrtc/audioContext";
import { logger } from "matrix-js-sdk/src/logger";

import { useSpatialAudio } from "../settings/useSetting";
import { useEventTarget } from "../useEvents";
import { useAudioOutputDevice } from "./useAudioOutputDevice";

declare global {
  interface Window {
    // For detecting whether this browser is Chrome or not
    chrome?: unknown;
  }
}

export const useMediaStreamTrackCount = (
  stream: MediaStream | null
): [number, number] => {
  const latestAudioTrackCount = stream ? stream.getAudioTracks().length : 0;
  const latestVideoTrackCount = stream ? stream.getVideoTracks().length : 0;

  const [audioTrackCount, setAudioTrackCount] = useState(
    stream ? stream.getAudioTracks().length : 0
  );
  const [videoTrackCount, setVideoTrackCount] = useState(
    stream ? stream.getVideoTracks().length : 0
  );

  const tracksChanged = useCallback(() => {
    setAudioTrackCount(stream ? stream.getAudioTracks().length : 0);
    setVideoTrackCount(stream ? stream.getVideoTracks().length : 0);
  }, [stream]);

  useEventTarget(stream, "addtrack", tracksChanged);
  useEventTarget(stream, "removetrack", tracksChanged);

  if (
    latestAudioTrackCount !== audioTrackCount ||
    latestVideoTrackCount !== videoTrackCount
  ) {
    tracksChanged();
  }

  return [audioTrackCount, videoTrackCount];
};

// Binds a media stream to a media output element, returning a ref for the
// media element that should then be passed to the media element to be used.
export const useMediaStream = (
  stream: MediaStream | null,
  audioOutputDevice: string | null,
  mute = false,
  localVolume?: number
): RefObject<MediaElement> => {
  const mediaRef = useRef<MediaElement>();

  useAudioOutputDevice(mediaRef, audioOutputDevice);

  useEffect(() => {
    console.log(
      `useMediaStream update stream mediaRef.current ${!!mediaRef.current} stream ${
        stream && stream.id
      } muted ${mute}`
    );

    if (mediaRef.current) {
      const mediaEl = mediaRef.current;

      if (stream) {
        mediaEl.muted = mute;
        mediaEl.srcObject = stream;
        mediaEl.play().catch((e) => {
          if (e.name !== "AbortError") throw e;
        });

        // Unmuting the tab in Safari causes all video elements to be individually
        // unmuted, so we need to reset the mute state here to prevent audio loops
        const onVolumeChange = () => {
          mediaEl.muted = mute;
        };
        mediaEl.addEventListener("volumechange", onVolumeChange);
        return () =>
          mediaEl.removeEventListener("volumechange", onVolumeChange);
      } else {
        mediaRef.current.srcObject = null;
      }
    }
  }, [stream, mute]);

  useEffect(() => {
    if (!mediaRef.current) return;
    if (localVolume === null || localVolume === undefined) return;

    mediaRef.current.volume = localVolume;
  }, [localVolume]);

  useEffect(() => {
    const mediaEl = mediaRef.current;

    return () => {
      if (mediaEl) {
        // Ensure we set srcObject to null before unmounting to prevent memory leak
        // https://webrtchacks.com/srcobject-intervention/
        mediaEl.srcObject = null;
      }
    };
  }, []);

  return mediaRef;
};

// Provides a properly refcounted instance of the shared audio context,
// along with the context's destination audio node and a ref to be used
// for the <audio> sink element.
export const useAudioContext = (): [AudioContext, AudioNode] => {
  const context = useRef<AudioContext>();
  const destination = useRef<AudioNode>();

  useEffect(() => {
    if (!context.current) {
      context.current = acquireContext();

      destination.current = context.current.destination;
      return releaseContext;
    }
  }, []);

  return [context.current!, destination.current!];
};

// Either renders a media stream with spatial audio or is just a no-op wrapper
// around useMediaStream, depending on whether spatial audio is enabled.
// Returns refs for the tile element from which the position is derived and
// a <video> element to render the video to.
// (hooks can't be conditional so we must use the same hook in each case).
export const useSpatialMediaStream = (
  stream: MediaStream | null,
  audioContext: AudioContext,
  audioDestination: AudioNode,
  localVolume: number,
  mute = false
): [RefObject<HTMLElement>, RefObject<MediaElement>] => {
  const tileRef = useRef<HTMLElement | null>(null);
  const [spatialAudio] = useSpatialAudio();

  // This media stream is only used for the video - the audio goes via the audio
  // context, so the audio output doesn't matter and the element is always muted
  // (we could split the video out into a separate stream with just the video track
  // and pass that as the srcObject of the element, but it seems unnecessary when we
  // can just mute the element).
  const mediaRef = useMediaStream(stream, null, true);
  const [audioTrackCount] = useMediaStreamTrackCount(stream);

  const gainNodeRef = useRef<GainNode>();
  const pannerNodeRef = useRef<PannerNode>();
  const sourceRef = useRef<MediaStreamAudioSourceNode>();

  useEffect(() => {
    if (spatialAudio) {
      if (tileRef.current && !mute && audioTrackCount > 0) {
        logger.debug(`Rendering spatial audio for ${stream!.id}`);

        if (!pannerNodeRef.current) {
          pannerNodeRef.current = new PannerNode(audioContext, {
            panningModel: "HRTF",
            refDistance: 3,
          });
        }
        if (!gainNodeRef.current) {
          gainNodeRef.current = new GainNode(audioContext, {
            gain: localVolume,
          });
        }
        if (!sourceRef.current || sourceRef.current.mediaStream !== stream!) {
          sourceRef.current = audioContext.createMediaStreamSource(stream!);
        }

        const tile = tileRef.current;
        const source = sourceRef.current;
        const gainNode = gainNodeRef.current;
        const pannerNode = pannerNodeRef.current;

        const updatePosition = () => {
          const bounds = tile.getBoundingClientRect();
          const windowSize = Math.max(window.innerWidth, window.innerHeight);
          // Position the source relative to its placement in the window
          pannerNodeRef.current!.positionX.value =
            (bounds.x + bounds.width / 2) / windowSize - 0.5;
          pannerNodeRef.current!.positionY.value =
            (bounds.y + bounds.height / 2) / windowSize - 0.5;
          // Put the source in front of the listener
          pannerNodeRef.current!.positionZ.value = -2;
        };

        gainNode.gain.value = localVolume;
        updatePosition();
        source.connect(gainNode).connect(pannerNode).connect(audioDestination);
        // HACK: We abuse the CSS transitionrun event to detect when the tile
        // moves, because useMeasure, IntersectionObserver, etc. all have no
        // ability to track changes in the CSS transform property
        tile.addEventListener("transitionrun", updatePosition);

        return () => {
          tile.removeEventListener("transitionrun", updatePosition);
          source.disconnect();
          gainNode.disconnect();
          pannerNode.disconnect();
        };
      } else if (stream) {
        logger.debug(
          `Not rendering spatial audio for ${stream.id} (tile ref ${Boolean(
            tileRef.current
          )}, mute ${mute}, track count ${audioTrackCount})`
        );
      }
    }
  }, [
    stream,
    spatialAudio,
    audioContext,
    audioDestination,
    mute,
    localVolume,
    audioTrackCount,
  ]);

  return [tileRef, mediaRef];
};
