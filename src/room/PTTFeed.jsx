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

import React from "react";
import { useCallFeed } from "../video-grid/useCallFeed";
import { useMediaStream } from "../video-grid/useMediaStream";
import styles from "./PTTFeed.module.css";

export function PTTFeed({ callFeed, audioOutputDevice }) {
  const { isLocal, stream } = useCallFeed(callFeed);
  const mediaRef = useMediaStream(stream, audioOutputDevice, isLocal);
  return <audio ref={mediaRef} className={styles.audioFeed} playsInline />;
}
