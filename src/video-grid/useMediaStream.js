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

export function useMediaStream(stream, audioOutputDevice, mute = false) {
  const mediaRef = useRef();

  useEffect(() => {
    console.log(
      `useMediaStream update stream mediaRef.current ${!!mediaRef.current} stream ${
        stream && stream.id
      }`
    );

    if (mediaRef.current) {
      if (stream) {
        mediaRef.current.muted = mute;
        mediaRef.current.srcObject = stream;
        mediaRef.current.play();
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
