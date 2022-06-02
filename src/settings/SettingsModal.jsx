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
import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { TabContainer, TabItem } from "../tabs/Tabs";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DeveloperIcon } from "../icons/Developer.svg";
import { SelectInput } from "../input/SelectInput";
import { Item } from "@react-stately/collections";
import { useMediaHandler } from "./useMediaHandler";
import { useSpatialAudio, useShowInspector } from "./useSetting";
import { FieldRow, InputField } from "../input/Input";
import { Button } from "../button";
import { useDownloadDebugLog } from "./submit-rageshake";
import { Body } from "../typography/Typography";

export const SettingsModal = (props) => {
  const {
    audioInput,
    audioInputs,
    setAudioInput,
    videoInput,
    videoInputs,
    setVideoInput,
    audioOutput,
    audioOutputs,
    setAudioOutput,
  } = useMediaHandler();
  const [spatialAudio, setSpatialAudio] = useSpatialAudio();
  const [showInspector, setShowInspector] = useShowInspector();

  const downloadDebugLog = useDownloadDebugLog();

  return (
    <Modal
      title="Settings"
      isDismissable
      mobileFullScreen
      className={styles.settingsModal}
      {...props}
    >
      <TabContainer className={styles.tabContainer}>
        <TabItem
          title={
            <>
              <AudioIcon width={16} height={16} />
              <span>Audio</span>
            </>
          }
        >
          <SelectInput
            label="Microphone"
            selectedKey={audioInput}
            onSelectionChange={setAudioInput}
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
            >
              {audioOutputs.map(({ deviceId, label }) => (
                <Item key={deviceId}>{label}</Item>
              ))}
            </SelectInput>
          )}
          <FieldRow>
            <InputField
              id="spatialAudio"
              label="Spatial audio (experimental)"
              type="checkbox"
              checked={spatialAudio}
              onChange={(e) => setSpatialAudio(e.target.checked)}
            />
          </FieldRow>
        </TabItem>
        <TabItem
          title={
            <>
              <VideoIcon width={16} height={16} />
              <span>Video</span>
            </>
          }
        >
          <SelectInput
            label="Camera"
            selectedKey={videoInput}
            onSelectionChange={setVideoInput}
          >
            {videoInputs.map(({ deviceId, label }) => (
              <Item key={deviceId}>{label}</Item>
            ))}
          </SelectInput>
        </TabItem>
        <TabItem
          title={
            <>
              <DeveloperIcon width={16} height={16} />
              <span>Developer</span>
            </>
          }
        >
          <FieldRow>
            <Body className={styles.fieldRowText}>
              Version: {import.meta.env.VITE_APP_VERSION || "dev"}
            </Body>
          </FieldRow>
          <FieldRow>
            <InputField
              id="showInspector"
              name="inspector"
              label="Show Call Inspector"
              type="checkbox"
              checked={showInspector}
              onChange={(e) => setShowInspector(e.target.checked)}
            />
          </FieldRow>
          <FieldRow>
            <Button onPress={downloadDebugLog}>Download Debug Logs</Button>
          </FieldRow>
        </TabItem>
      </TabContainer>
    </Modal>
  );
};
