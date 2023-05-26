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
import { Item } from "@react-stately/collections";
import { useTranslation } from "react-i18next";

import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { TabContainer, TabItem } from "../tabs/Tabs";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DeveloperIcon } from "../icons/Developer.svg";
import { ReactComponent as OverflowIcon } from "../icons/Overflow.svg";
import { SelectInput } from "../input/SelectInput";
import { MediaDevicesState } from "../room/devices/useMediaDevices";
import {
  useKeyboardShortcuts,
  useSpatialAudio,
  useShowInspector,
  useOptInAnalytics,
  canEnableSpatialAudio,
} from "./useSetting";
import { FieldRow, InputField } from "../input/Input";
import { Button } from "../button";
import { useDownloadDebugLog } from "./submit-rageshake";
import { Body } from "../typography/Typography";

interface Props {
  mediaDevices: MediaDevicesState;
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = (props: Props) => {
  const { t } = useTranslation();

  const [spatialAudio, setSpatialAudio] = useSpatialAudio();
  const [showInspector, setShowInspector] = useShowInspector();
  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  const [keyboardShortcuts, setKeyboardShortcuts] = useKeyboardShortcuts();

  const downloadDebugLog = useDownloadDebugLog();

  // Generate a `SelectInput` with a list of devices for a given device kind.
  const generateDeviceSelection = (kind: MediaDeviceKind, caption: string) => {
    const devices = props.mediaDevices.state.get(kind);
    if (!devices) return null;

    return (
      <SelectInput
        label={caption}
        selectedKey={devices.available[devices.selected].deviceId}
        onSelectionChange={(id) =>
          props.mediaDevices.selectActiveDevice(kind, id.toString())
        }
      >
        {devices.available.map(({ deviceId, label }, index) => (
          <Item key={deviceId}>
            {!!label && label.trim().length > 0
              ? label
              : `${caption} ${index + 1}`}
          </Item>
        ))}
      </SelectInput>
    );
  };

  return (
    <Modal
      title={t("Settings")}
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
              <span>{t("Audio")}</span>
            </>
          }
        >
          {generateDeviceSelection("audioinput", t("Microphone"))}
          {generateDeviceSelection("audiooutput", t("Speaker"))}
          <FieldRow>
            <InputField
              id="spatialAudio"
              label={t("Spatial audio")}
              type="checkbox"
              checked={spatialAudio}
              disabled={!canEnableSpatialAudio()}
              description={
                canEnableSpatialAudio()
                  ? t(
                      "This will make a speaker's audio seem as if it is coming from where their tile is positioned on screen. (Experimental feature: this may impact the stability of audio.)"
                    )
                  : t("This feature is only supported on Firefox.")
              }
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
              <span>{t("Video")}</span>
            </>
          }
        >
          {generateDeviceSelection("videoinput", t("Camera"))}
        </TabItem>
        <TabItem
          title={
            <>
              <OverflowIcon width={16} height={16} />
              <span>{t("Advanced")}</span>
            </>
          }
        >
          <FieldRow>
            <InputField
              id="optInAnalytics"
              label={t("Allow analytics")}
              type="checkbox"
              checked={optInAnalytics}
              description={t(
                "This will send anonymised data (such as the duration of a call and the number of participants) to the Element Call team to help us optimise the application based on how it is used."
              )}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setOptInAnalytics(event.target.checked)
              }
            />
          </FieldRow>
          <FieldRow>
            <InputField
              id="keyboardShortcuts"
              label={t("Single-key keyboard shortcuts")}
              type="checkbox"
              checked={keyboardShortcuts}
              description={t(
                "Whether to enable single-key keyboard shortcuts, e.g. 'm' to mute/unmute the mic."
              )}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setKeyboardShortcuts(event.target.checked)
              }
            />
          </FieldRow>
        </TabItem>
        <TabItem
          title={
            <>
              <DeveloperIcon width={16} height={16} />
              <span>{t("Developer")}</span>
            </>
          }
        >
          <FieldRow>
            <Body className={styles.fieldRowText}>
              {t("Version: {{version}}", {
                version: import.meta.env.VITE_APP_VERSION || "dev",
              })}
            </Body>
          </FieldRow>
          <FieldRow>
            <InputField
              id="showInspector"
              name="inspector"
              label={t("Show call inspector")}
              type="checkbox"
              checked={showInspector}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShowInspector(e.target.checked)
              }
            />
          </FieldRow>
          <FieldRow>
            <Button onPress={downloadDebugLog}>
              {t("Download debug logs")}
            </Button>
          </FieldRow>
        </TabItem>
      </TabContainer>
    </Modal>
  );
};
