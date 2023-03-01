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
import { useMediaHandler } from "./useMediaHandler";
import {
  useKeyboardShortcuts,
  useSpatialAudio,
  useShowInspector,
  useOptInAnalytics,
  canEnableSpatialAudio,
  useNewGrid,
  useDeveloperSettingsTab,
} from "./useSetting";
import { FieldRow, InputField } from "../input/Input";
import { Button } from "../button";
import { useDownloadDebugLog } from "./submit-rageshake";
import { Body } from "../typography/Typography";
import { optInDescription } from "../analytics/AnalyticsOptInDescription";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = (props: Props) => {
  const { t } = useTranslation();
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
  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  const [developerSettingsTab, setDeveloperSettingsTab] =
    useDeveloperSettingsTab();
  const [keyboardShortcuts, setKeyboardShortcuts] = useKeyboardShortcuts();
  const [newGrid, setNewGrid] = useNewGrid();

  const downloadDebugLog = useDownloadDebugLog();

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
              <span className={styles.tabLabel}>{t("Audio")}</span>
            </>
          }
        >
          <SelectInput
            label={t("Microphone")}
            selectedKey={audioInput}
            onSelectionChange={setAudioInput}
          >
            {audioInputs.map(({ deviceId, label }, index) => (
              <Item key={deviceId}>
                {!!label && label.trim().length > 0
                  ? label
                  : t("Microphone {{n}}", { n: index + 1 })}
              </Item>
            ))}
          </SelectInput>
          {audioOutputs.length > 0 && (
            <SelectInput
              label={t("Speaker")}
              selectedKey={audioOutput}
              onSelectionChange={setAudioOutput}
            >
              {audioOutputs.map(({ deviceId, label }, index) => (
                <Item key={deviceId}>
                  {!!label && label.trim().length > 0
                    ? label
                    : t("Speaker {{n}}", { n: index + 1 })}
                </Item>
              ))}
            </SelectInput>
          )}
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
          <SelectInput
            label={t("Camera")}
            selectedKey={videoInput}
            onSelectionChange={setVideoInput}
          >
            {videoInputs.map(({ deviceId, label }, index) => (
              <Item key={deviceId}>
                {!!label && label.trim().length > 0
                  ? label
                  : t("Camera {{n}}", { n: index + 1 })}
              </Item>
            ))}
          </SelectInput>
        </TabItem>
        <TabItem
          title={
            <>
              <OverflowIcon width={16} height={16} />
              <span>{t("More")}</span>
            </>
          }
        >
          <h4>Keyboard</h4>
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
          <h4>Analytics</h4>
          <FieldRow>
            <InputField
              id="optInAnalytics"
              type="checkbox"
              checked={optInAnalytics}
              description={optInDescription()}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setOptInAnalytics(event.target.checked)
              }
            />
          </FieldRow>
          <FieldRow>
            <InputField
              id="developerSettingsTab"
              type="checkbox"
              checked={developerSettingsTab}
              label={t("Developer Settings")}
              description={t(
                "Expose developer settings in the settings window."
              )}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDeveloperSettingsTab(event.target.checked)
              }
            />
          </FieldRow>
        </TabItem>
        {developerSettingsTab && (
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
              <InputField
                id="newGrid"
                label={t("Use the upcoming grid system")}
                type="checkbox"
                checked={newGrid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewGrid(e.target.checked)
                }
              />
            </FieldRow>
            <FieldRow>
              <Button onPress={downloadDebugLog}>
                {t("Download debug logs")}
              </Button>
            </FieldRow>
          </TabItem>
        )}
      </TabContainer>
    </Modal>
  );
};
