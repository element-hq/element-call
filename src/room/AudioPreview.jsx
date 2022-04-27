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
      <h1>{`${roomName} - Radio Call`}</h1>
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
