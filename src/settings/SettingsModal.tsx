/*
Copyright 2022 - 2023 New Vector Ltd

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
import { MatrixClient } from "matrix-js-sdk";
import { Trans, useTranslation } from "react-i18next";
import { SetMediaDeviceOptions } from "@livekit/components-core";

import { Modal } from "../Modal";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { Button } from "../button";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as DeveloperIcon } from "../icons/Developer.svg";
import { ReactComponent as FeedbackIcon } from "../icons/Feedback.svg";
import { ReactComponent as OverflowIcon } from "../icons/Overflow.svg";
import { ReactComponent as UserIcon } from "../icons/User.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { FieldRow, InputField } from "../input/Input";
import { SelectInput } from "../input/SelectInput";
import { LocalUserChoices, MediaDevicesList } from "../livekit/useLiveKit";
import { TabContainer, TabItem } from "../tabs/Tabs";
import { Body, Caption } from "../typography/Typography";
import { FeedbackSettingsTab } from "./FeedbackSettingsTab";
import { ProfileSettingsTab } from "./ProfileSettingsTab";
import styles from "./SettingsModal.module.css";
import { useDownloadDebugLog } from "./submit-rageshake";
import {
  useDeveloperSettingsTab,
  useOptInAnalytics,
  useShowInspector,
} from "./useSetting";

interface Props {
  mediaDevices: MediaDevicesList;
  userChoices: LocalUserChoices;
  isOpen: boolean;
  client: MatrixClient;
  roomId?: string;
  defaultTab?: string;
  onClose: () => void;
}

export const SettingsModal = (props: Props) => {
  const { t } = useTranslation();

  const [showInspector, setShowInspector] = useShowInspector();
  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  const [developerSettingsTab, setDeveloperSettingsTab] =
    useDeveloperSettingsTab();

  const downloadDebugLog = useDownloadDebugLog();

  // Generate a `SelectInput` with a list of devices for a given device kind.
  const generateDeviceSelection = (kind: MediaDeviceKind, caption: string) => {
    let devices: MediaDeviceInfo[];
    let selectedId: string;
    let selectActiveDevice: (
      id: string,
      options?: SetMediaDeviceOptions
    ) => Promise<void>;
    switch (kind) {
      case "audioinput":
        devices = props.mediaDevices.audioDevices;
        selectedId = props.userChoices.activeAudioDeviceId;
        selectActiveDevice = props.userChoices.setActiveAudioDevice;
        break;
      case "videoinput":
        devices = props.mediaDevices.videoDevices;
        selectedId = props.userChoices.activeAudioDeviceId;
        selectActiveDevice = props.userChoices.setActiveVideoDevice;

        break;
      case "audiooutput":
        devices = props.mediaDevices.audioOutputDevices;
        selectedId = props.userChoices.activeAudioOutputDeviceId;
        selectActiveDevice = props.userChoices.setActiveAudioOutputDevice;
        break;
    }
    switch (kind) {
      case "audioinput":
        break;
      case "videoinput":
        break;
      case "audiooutput":
        break;
    }

    if (!devices || devices.length == 0) return null;

    return (
      <SelectInput
        label={caption}
        selectedKey={selectedId}
        onSelectionChange={(id) => selectActiveDevice(id.toString())}
      >
        {devices.map(({ deviceId, label }, index) => (
          <Item key={deviceId}>
            {!!label && label.trim().length > 0
              ? label
              : `${caption} ${index + 1}`}
          </Item>
        ))}
      </SelectInput>
    );
  };

  const [selectedTab, setSelectedTab] = useState<string | undefined>();

  const onSelectedTabChanged = useCallback(
    (tab) => {
      setSelectedTab(tab);
    },
    [setSelectedTab]
  );

  const optInDescription = (
    <Caption>
      <Trans>
        <AnalyticsNotice />
        <br />
        You may withdraw consent by unchecking this box. If you are currently in
        a call, this setting will take effect at the end of the call.
      </Trans>
    </Caption>
  );

  return (
    <Modal
      title={t("Settings")}
      isDismissable
      mobileFullScreen
      className={styles.settingsModal}
      {...props}
    >
      <TabContainer
        onSelectionChange={onSelectedTabChanged}
        selectedKey={selectedTab ?? props.defaultTab ?? "audio"}
        className={styles.tabContainer}
      >
        <TabItem
          key="audio"
          title={
            <>
              <AudioIcon width={16} height={16} />
              <span className={styles.tabLabel}>{t("Audio")}</span>
            </>
          }
        >
          {generateDeviceSelection("audioinput", t("Microphone"))}
          {generateDeviceSelection("audiooutput", t("Speaker"))}
        </TabItem>
        <TabItem
          key="video"
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
          key="profile"
          title={
            <>
              <UserIcon width={15} height={15} />
              <span>{t("Profile")}</span>
            </>
          }
        >
          <ProfileSettingsTab client={props.client} />
        </TabItem>
        <TabItem
          key="feedback"
          title={
            <>
              <FeedbackIcon width={16} height={16} />
              <span>{t("Feedback")}</span>
            </>
          }
        >
          <FeedbackSettingsTab roomId={props.roomId} />
        </TabItem>
        <TabItem
          key="more"
          title={
            <>
              <OverflowIcon width={16} height={16} />
              <span>{t("More")}</span>
            </>
          }
        >
          <h4>Developer</h4>
          <p>
            Version: {(import.meta.env.VITE_APP_VERSION as string) || "dev"}
          </p>
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
          <h4>Analytics</h4>
          <FieldRow>
            <InputField
              id="optInAnalytics"
              type="checkbox"
              checked={optInAnalytics}
              description={optInDescription}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setOptInAnalytics(event.target.checked)
              }
            />
          </FieldRow>
        </TabItem>
        {developerSettingsTab && (
          <TabItem
            key="developer"
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
        )}
      </TabContainer>
    </Modal>
  );
};
