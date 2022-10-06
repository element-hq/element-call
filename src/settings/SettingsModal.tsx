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
import { Item } from "@react-stately/collections";

import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { TabContainer, TabItem } from "../tabs/Tabs";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DeveloperIcon } from "../icons/Developer.svg";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import { SelectInput } from "../input/SelectInput";
import { useMediaHandler } from "./useMediaHandler";
import { useSpatialAudio, useShowInspector } from "./useSetting";
import { FieldRow, InputField } from "../input/Input";
import { Button } from "../button";
import { useDownloadDebugLog } from "./submit-rageshake";
import { Body } from "../typography/Typography";
import { VoiceActivationThresholdSlider } from "./VoiceActivationThresholdSlider";
import { useToggleMicrophoneMute } from "./useSetting";
import { InputSlider } from "../input/InputSlider";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = (props: Props) => {
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
  const [voiceActivationTesting, setVoiceActivationTesting] = useState(false);
  const [, setMicrophoneMuted] = useToggleMicrophoneMute();

  const downloadDebugLog = useDownloadDebugLog();

  const handleVoiceActivationTesting = useCallback(() => {
    setVoiceActivationTesting(
      (voiceActivationTesting) => !voiceActivationTesting
    );
    setMicrophoneMuted(!voiceActivationTesting);
  }, [setMicrophoneMuted, setVoiceActivationTesting, voiceActivationTesting]);

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
            {audioInputs.map(({ deviceId, label }, index) => (
              <Item key={deviceId}>
                {!!label && label.trim().length > 0
                  ? label
                  : `Microphone ${index + 1}`}
              </Item>
            ))}
          </SelectInput>
          {audioOutputs.length > 0 && (
            <SelectInput
              label="Speaker"
              selectedKey={audioOutput}
              onSelectionChange={setAudioOutput}
            >
              {audioOutputs.map(({ deviceId, label }, index) => (
                <Item key={deviceId}>
                  {!!label && label.trim().length > 0
                    ? label
                    : `Speaker ${index + 1}`}
                </Item>
              ))}
            </SelectInput>
          )}

          <FieldRow>
            <InputField
              id="spatialAudio"
              label="Spatial audio"
              type="checkbox"
              checked={spatialAudio}
              description="This will make a speaker's audio seem as if it is coming from where their tile is positioned on screen. (Experimental feature: this may impact the stability of audio.)"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSpatialAudio(event.target.checked)
              }
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
            {videoInputs.map(({ deviceId, label }, index) => (
              <Item key={deviceId}>
                {!!label && label.trim().length > 0
                  ? label
                  : `Camera ${index + 1}`}
              </Item>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShowInspector(e.target.checked)
              }
            />
          </FieldRow>
          <FieldRow>
            <Button onPress={downloadDebugLog}>Download Debug Logs</Button>
          </FieldRow>
        </TabItem>
        <TabItem
          title={
            <>
              <SettingsIcon width={16} height={16} />
              <span>Advanced</span>
            </>
          }
        >
          <InputSlider
            label="Voice activation threshold"
            children={
              <>
                <Button
                  size="lg"
                  variant="default"
                  onPress={() => handleVoiceActivationTesting()}
                >
                  {voiceActivationTesting ? "stop" : "test"}
                </Button>
                <VoiceActivationThresholdSlider
                  enabled={voiceActivationTesting}
                />
              </>
            }
            description="Sets a threshold that your voice needs to surpass (The bar lights up in green when your microphone is louder than the threshold). You will not be heard when the volume of your microphone drops below that threshold. You are muted during configuration."
          />
        </TabItem>
      </TabContainer>
    </Modal>
  );
};
