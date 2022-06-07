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
import styles from "./AudioPreview.module.css";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { SelectInput } from "../input/SelectInput";
import { Item } from "@react-stately/collections";
import { Body } from "../typography/Typography";

export function AudioPreview({
  state,
  roomName,
  audioInput,
  audioInputs,
  setAudioInput,
  audioOutput,
  audioOutputs,
  setAudioOutput,
}) {
  return (
    <>
      <h1>{`${roomName} - Walkie-talkie call`}</h1>
      <div className={styles.preview}>
        {state === GroupCallState.LocalCallFeedUninitialized && (
          <Body fontWeight="semiBold" className={styles.microphonePermissions}>
            Microphone permissions needed to join the call.
          </Body>
        )}
        {state === GroupCallState.InitializingLocalCallFeed && (
          <Body fontWeight="semiBold" className={styles.microphonePermissions}>
            Accept microphone permissions to join the call.
          </Body>
        )}
        {state === GroupCallState.LocalCallFeedInitialized && (
          <>
            <SelectInput
              label="Microphone"
              selectedKey={audioInput}
              onSelectionChange={setAudioInput}
              className={styles.inputField}
            >
              {audioInputs.map(({ deviceId, label }) => (
                <Item key={deviceId}>{label}</Item>
              ))}
            </SelectInput>
            {audioOutputs.length > 0 && (
              <SelectInput
                label="Speaker"
                selectedKey={audioOutput}
                onSelectionChange={setAudioOutput}
                className={styles.inputField}
              >
                {audioOutputs.map(({ deviceId, label }) => (
                  <Item key={deviceId}>{label}</Item>
                ))}
              </SelectInput>
            )}
          </>
        )}
      </div>
    </>
  );
}
