/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useRef, useEffect } from "react";

import { useSpatialAudio } from "../settings/useSetting";

export function useMediaStream(stream, audioOutputDevice, mute = false) {
  const mediaRef = useRef();

  useEffect(() => {
    console.log(
      `useMediaStream update stream mediaRef.current ${!!mediaRef.current} stream ${
        stream && stream.id
      }`
    );

    if (mediaRef.current) {
      const mediaEl = mediaRef.current;

      if (stream) {
        mediaEl.muted = mute;
        mediaEl.srcObject = stream;
        mediaEl.play();

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
    if (
      mediaRef.current &&
      audioOutputDevice &&
      mediaRef.current !== undefined
    ) {
      console.log(`useMediaStream setSinkId ${audioOutputDevice}`);
      mediaRef.current.setSinkId(audioOutputDevice);
    }
  }, [audioOutputDevice]);

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
}

export const useSpatialMediaStream = (
  stream,
  audioOutputDevice,
  audioContext,
  mute = false
) => {
  const tileRef = useRef();
  const [spatialAudio] = useSpatialAudio();
  // If spatial audio is enabled, we handle mute state separately from the video element
  const mediaRef = useMediaStream(
    stream,
    audioOutputDevice,
    spatialAudio || mute
  );

  const pannerNodeRef = useRef();
  if (!pannerNodeRef.current) {
    pannerNodeRef.current = new PannerNode(audioContext, {
      panningModel: "HRTF",
    });
  }

  useEffect(() => {
    if (spatialAudio && tileRef.current && mediaRef.current && !mute) {
      const tile = tileRef.current;
      const pannerNode = pannerNodeRef.current;

      const source = audioContext.createMediaElementSource(mediaRef.current);
      const updatePosition = () => {
        const bounds = tile.getBoundingClientRect();
        const windowSize = Math.max(window.innerWidth, window.innerHeight);
        // Position the source relative to its placement in the window
        pannerNodeRef.current.positionX.value =
          (bounds.x + bounds.width / 2) / windowSize - 0.5;
        pannerNodeRef.current.positionY.value =
          (bounds.y + bounds.height / 2) / windowSize - 0.5;
        // Put the source in front of the listener
        pannerNodeRef.current.positionZ.value = -2;
      };

      source.connect(pannerNode);
      pannerNode.connect(audioContext.destination);
      // HACK: We abuse the CSS transitionrun event to detect when the tile
      // moves, because useMeasure, IntersectionObserver, etc. all have no
      // ability to track changes in the CSS transform property
      tile.addEventListener("transitionrun", updatePosition);

      return () => {
        tile.removeEventListener("transitionrun", updatePosition);
        source.disconnect();
        pannerNode.disconnect();
      };
    }
  }, [spatialAudio, audioContext, mediaRef, mute]);

  return [tileRef, mediaRef];
};
