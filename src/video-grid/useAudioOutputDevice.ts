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

import { RefObject, useEffect } from "react";

// Uses setSinkId on an audio output element to set the device it outputs to,
// where supported by the browser.
export function useAudioOutputDevice(
  mediaRef: RefObject<MediaElement>,
  audioOutputDevice: string | undefined
): void {
  useEffect(() => {
    if (
      mediaRef.current &&
      mediaRef.current !== undefined &&
      audioOutputDevice
    ) {
      if (mediaRef.current.setSinkId) {
        console.log(
          `useMediaStream setting output setSinkId ${audioOutputDevice}`
        );
        // Chrome for Android doesn't support this
        mediaRef.current.setSinkId(audioOutputDevice);
      } else {
        console.log("Can't set output - no setsinkid");
      }
    }
  }, [mediaRef, audioOutputDevice]);
}
