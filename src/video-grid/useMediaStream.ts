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

import { useRef, useEffect, RefObject, useState, useCallback } from "react";
import { parse as parseSdp, write as writeSdp } from "sdp-transform";
import {
  acquireContext,
  releaseContext,
} from "matrix-js-sdk/src/webrtc/audioContext";

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
  stream: MediaStream
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

export const useMediaStream = (
  stream: MediaStream,
  audioOutputDevice: string,
  mute = false,
  localVolume?: number
): RefObject<MediaElement> => {
  const mediaRef = useRef<MediaElement>();

  useAudioOutputDevice(mediaRef, audioOutputDevice);

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

// Loops the given audio stream back through a local peer connection, to make
// AEC work with Web Audio streams on Chrome. The resulting stream should be
// played through an audio element.
// This hack can be removed once the following bug is resolved:
// https://bugs.chromium.org/p/chromium/issues/detail?id=687574
const createLoopback = async (stream: MediaStream): Promise<MediaStream> => {
  // Prepare our local peer connections
  const conn = new RTCPeerConnection();
  const loopbackConn = new RTCPeerConnection();
  const loopbackStream = new MediaStream();

  conn.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) loopbackConn.addIceCandidate(new RTCIceCandidate(candidate));
  });
  loopbackConn.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) conn.addIceCandidate(new RTCIceCandidate(candidate));
  });
  loopbackConn.addEventListener("track", ({ track }) =>
    loopbackStream.addTrack(track)
  );

  // Hook the connections together
  stream.getTracks().forEach((track) => conn.addTrack(track));
  const offer = await conn.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await conn.setLocalDescription(offer);

  await loopbackConn.setRemoteDescription(offer);
  const answer = await loopbackConn.createAnswer();
  // Rewrite SDP to be stereo and (variable) max bitrate
  const parsedSdp = parseSdp(answer.sdp);
  parsedSdp.media.forEach((m) =>
    m.fmtp.forEach(
      (f) => (f.config += `;stereo=1;cbr=0;maxaveragebitrate=510000;`)
    )
  );
  answer.sdp = writeSdp(parsedSdp);

  await loopbackConn.setLocalDescription(answer);
  await conn.setRemoteDescription(answer);

  return loopbackStream;
};

export const useAudioContext = (): [
  AudioContext,
  AudioNode,
  RefObject<MediaElement>
] => {
  const context = useRef<AudioContext>();
  const destination = useRef<AudioNode>();
  const audioRef = useRef<MediaElement>();

  useEffect(() => {
    if (audioRef.current && !context.current) {
      context.current = acquireContext();

      if (window.chrome) {
        // We're in Chrome, which needs a loopback hack applied to enable AEC
        const streamDest = context.current.createMediaStreamDestination();
        destination.current = streamDest;

        const audioEl = audioRef.current;
        (async () => {
          audioEl.srcObject = await createLoopback(streamDest.stream);
          await audioEl.play();
        })();
        return () => {
          audioEl.srcObject = null;
          releaseContext();
        };
      } else {
        destination.current = context.current.destination;
        return releaseContext;
      }
    }
  }, []);

  return [context.current, destination.current, audioRef];
};

export const useSpatialMediaStream = (
  stream: MediaStream,
  audioContext: AudioContext,
  audioDestination: AudioNode,
  mute = false,
  localVolume?: number
): [RefObject<HTMLDivElement>, RefObject<MediaElement>] => {
  const tileRef = useRef<HTMLDivElement>();
  const [spatialAudio] = useSpatialAudio();
  // We always handle audio separately form the video element
  const mediaRef = useMediaStream(stream, undefined, true, undefined);
  const [audioTrackCount] = useMediaStreamTrackCount(stream);

  const gainNodeRef = useRef<GainNode>();
  const pannerNodeRef = useRef<PannerNode>();
  const sourceRef = useRef<MediaStreamAudioSourceNode>();

  useEffect(() => {
    if (spatialAudio && tileRef.current && !mute && audioTrackCount > 0) {
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
      if (!sourceRef.current) {
        sourceRef.current = audioContext.createMediaStreamSource(stream);
      }

      const tile = tileRef.current;
      const source = sourceRef.current;
      const gainNode = gainNodeRef.current;
      const pannerNode = pannerNodeRef.current;

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
