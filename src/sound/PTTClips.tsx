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

import React from "react";

import startTalkLocalOggUrl from "./start_talk_local.ogg";
import startTalkLocalMp3Url from "./start_talk_local.mp3";
import startTalkRemoteOggUrl from "./start_talk_remote.ogg";
import startTalkRemoteMp3Url from "./start_talk_remote.mp3";
import endTalkOggUrl from "./end_talk.ogg";
import endTalkMp3Url from "./end_talk.mp3";
import blockedOggUrl from "./blocked.ogg";
import blockedMp3Url from "./blocked.mp3";
import styles from "./PTTClips.module.css";

interface Props {
  startTalkingLocalRef: React.RefObject<HTMLAudioElement>;
  startTalkingRemoteRef: React.RefObject<HTMLAudioElement>;
  endTalkingRef: React.RefObject<HTMLAudioElement>;
  blockedRef: React.RefObject<HTMLAudioElement>;
}

export const PTTClips: React.FC<Props> = ({
  startTalkingLocalRef,
  startTalkingRemoteRef,
  endTalkingRef,
  blockedRef,
}) => {
  return (
    <>
      <audio
        preload="auto"
        className={styles.pttClip}
        ref={startTalkingLocalRef}
      >
        <source type="audio/ogg" src={startTalkLocalOggUrl} />
        <source type="audio/mpeg" src={startTalkLocalMp3Url} />
      </audio>
      <audio
        preload="auto"
        className={styles.pttClip}
        ref={startTalkingRemoteRef}
      >
        <source type="audio/ogg" src={startTalkRemoteOggUrl} />
        <source type="audio/mpeg" src={startTalkRemoteMp3Url} />
      </audio>
      <audio preload="auto" className={styles.pttClip} ref={endTalkingRef}>
        <source type="audio/ogg" src={endTalkOggUrl} />
        <source type="audio/mpeg" src={endTalkMp3Url} />
      </audio>
      <audio preload="auto" className={styles.pttClip} ref={blockedRef}>
        <source type="audio/ogg" src={blockedOggUrl} />
        <source type="audio/mpeg" src={blockedMp3Url} />
      </audio>
    </>
  );
};
