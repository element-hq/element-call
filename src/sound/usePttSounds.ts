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

import React, { useCallback, useState } from "react";

export enum PTTClipID {
  START_TALKING_LOCAL,
  START_TALKING_REMOTE,
  END_TALKING,
  BLOCKED,
}

export type PlayClipFunction = (clipID: PTTClipID) => void;

interface PTTSounds {
  startTalkingLocalRef: React.RefObject<HTMLAudioElement>;
  startTalkingRemoteRef: React.RefObject<HTMLAudioElement>;
  endTalkingRef: React.RefObject<HTMLAudioElement>;
  blockedRef: React.RefObject<HTMLAudioElement>;
  playClip: PlayClipFunction;
}

export const usePTTSounds = (): PTTSounds => {
  const [startTalkingLocalRef] = useState(React.createRef<HTMLAudioElement>());
  const [startTalkingRemoteRef] = useState(React.createRef<HTMLAudioElement>());
  const [endTalkingRef] = useState(React.createRef<HTMLAudioElement>());
  const [blockedRef] = useState(React.createRef<HTMLAudioElement>());

  const playClip = useCallback(
    async (clipID: PTTClipID) => {
      let ref: React.RefObject<HTMLAudioElement>;

      switch (clipID) {
        case PTTClipID.START_TALKING_LOCAL:
          ref = startTalkingLocalRef;
          break;
        case PTTClipID.START_TALKING_REMOTE:
          ref = startTalkingRemoteRef;
          break;
        case PTTClipID.END_TALKING:
          ref = endTalkingRef;
          break;
        case PTTClipID.BLOCKED:
          ref = blockedRef;
          break;
      }
      if (ref.current) {
        ref.current.currentTime = 0;
        await ref.current.play();
      } else {
        console.log("No media element found");
      }
    },
    [startTalkingLocalRef, startTalkingRemoteRef, endTalkingRef, blockedRef]
  );

  return {
    startTalkingLocalRef,
    startTalkingRemoteRef,
    endTalkingRef,
    blockedRef,
    playClip,
  };
};
