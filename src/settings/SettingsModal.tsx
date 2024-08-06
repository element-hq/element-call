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

import { ChangeEvent, FC, Key, ReactNode, useCallback } from "react";
import { Item } from "@react-stately/collections";
import { Trans, useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk";

import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { TabContainer, TabItem } from "../tabs/Tabs";
import AudioIcon from "../icons/Audio.svg?react";
import VideoIcon from "../icons/Video.svg?react";
import DeveloperIcon from "../icons/Developer.svg?react";
import OverflowIcon from "../icons/Overflow.svg?react";
import UserIcon from "../icons/User.svg?react";
import FeedbackIcon from "../icons/Feedback.svg?react";
import { SelectInput } from "../input/SelectInput";
import { FieldRow, InputField } from "../input/Input";
import { Body, Caption } from "../typography/Typography";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { ProfileSettingsTab } from "./ProfileSettingsTab";
import { FeedbackSettingsTab } from "./FeedbackSettingsTab";
import {
  useMediaDevices,
  MediaDevice,
  useMediaDeviceNames,
} from "../livekit/MediaDevicesContext";
import { widget } from "../widget";
import {
  useSetting,
  optInAnalytics as optInAnalyticsSetting,
  developerSettingsTab as developerSettingsTabSetting,
  duplicateTiles as duplicateTilesSetting,
} from "./settings";
import { isFirefox } from "../Platform";

type SettingsTab =
  | "audio"
  | "video"
  | "profile"
  | "feedback"
  | "more"
  | "developer";

interface Props {
  open: boolean;
  onDismiss: () => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  client: MatrixClient;
  roomId?: string;
}

export const defaultSettingsTab: SettingsTab = "audio";

export const SettingsModal: FC<Props> = ({
  open,
  onDismiss,
  tab,
  onTabChange,
  client,
  roomId,
}) => {
  const { t } = useTranslation();

  const [optInAnalytics, setOptInAnalytics] = useSetting(optInAnalyticsSetting);
  const [developerSettingsTab, setDeveloperSettingsTab] = useSetting(
    developerSettingsTabSetting,
  );
  const [duplicateTiles, setDuplicateTiles] = useSetting(duplicateTilesSetting);

  // Generate a `SelectInput` with a list of devices for a given device kind.
  const generateDeviceSelection = (
    devices: MediaDevice,
    caption: string,
  ): ReactNode => {
    if (devices.available.length == 0) return null;

    return (
      <SelectInput
        label={caption}
        selectedKey={
          devices.selectedId === "" || !devices.selectedId
            ? "default"
            : devices.selectedId
        }
        onSelectionChange={(id): void => devices.select(id.toString())}
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

  const optInDescription = (
    <Caption>
      <Trans i18nKey="settings.opt_in_description">
        <AnalyticsNotice />
        <br />
        You may withdraw consent by unchecking this box. If you are currently in
        a call, this setting will take effect at the end of the call.
      </Trans>
    </Caption>
  );

  const devices = useMediaDevices();
  useMediaDeviceNames(devices, open);

  const audioTab = (
    <TabItem
      key="audio"
      title={
        <>
          <AudioIcon width={16} height={16} />
          <span className={styles.tabLabel}>{t("common.audio")}</span>
        </>
      }
    >
      {generateDeviceSelection(devices.audioInput, t("common.microphone"))}
      {!isFirefox() &&
        generateDeviceSelection(
          devices.audioOutput,
          t("settings.speaker_device_selection_label"),
        )}
    </TabItem>
  );

  const videoTab = (
    <TabItem
      key="video"
      title={
        <>
          <VideoIcon width={16} height={16} />
          <span>{t("common.video")}</span>
        </>
      }
    >
      {generateDeviceSelection(devices.videoInput, t("common.camera"))}
    </TabItem>
  );

  const profileTab = (
    <TabItem
      key="profile"
      title={
        <>
          <UserIcon width={15} height={15} />
          <span>{t("common.profile")}</span>
        </>
      }
    >
      <ProfileSettingsTab client={client} />
    </TabItem>
  );

  const feedbackTab = (
    <TabItem
      key="feedback"
      title={
        <>
          <FeedbackIcon width={16} height={16} />
          <span>{t("settings.feedback_tab_title")}</span>
        </>
      }
    >
      <FeedbackSettingsTab roomId={roomId} />
    </TabItem>
  );

  const moreTab = (
    <TabItem
      key="more"
      title={
        <>
          <OverflowIcon width={16} height={16} />
          <span>{t("settings.more_tab_title")}</span>
        </>
      }
    >
      <h4>{t("settings.developer_tab_title")}</h4>
      <p>
        {t("version", {
          version: import.meta.env.VITE_APP_VERSION || "dev",
        })}
      </p>
      <FieldRow>
        <InputField
          id="developerSettingsTab"
          type="checkbox"
          checked={developerSettingsTab}
          label={t("settings.developer_settings_label")}
          description={t("settings.developer_settings_label_description")}
          onChange={(event: ChangeEvent<HTMLInputElement>): void =>
            setDeveloperSettingsTab(event.target.checked)
          }
        />
      </FieldRow>
      <h4>{t("common.analytics")}</h4>
      <FieldRow>
        <InputField
          id="optInAnalytics"
          type="checkbox"
          checked={optInAnalytics ?? undefined}
          description={optInDescription}
          onChange={(event: ChangeEvent<HTMLInputElement>): void => {
            setOptInAnalytics?.(event.target.checked);
          }}
        />
      </FieldRow>
    </TabItem>
  );

  const developerTab = (
    <TabItem
      key="developer"
      title={
        <>
          <DeveloperIcon width={16} height={16} />
          <span>{t("settings.developer_tab_title")}</span>
        </>
      }
    >
      <FieldRow>
        <Body className={styles.fieldRowText}>
          {t("version", {
            version: import.meta.env.VITE_APP_VERSION || "dev",
          })}
        </Body>
      </FieldRow>
      <FieldRow>
        <InputField
          id="duplicateTiles"
          type="number"
          label={t("settings.duplicate_tiles_label")}
          value={duplicateTiles.toString()}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              const value = event.target.valueAsNumber;
              setDuplicateTiles(Number.isNaN(value) ? 0 : value);
            },
            [setDuplicateTiles],
          )}
        />
      </FieldRow>
    </TabItem>
  );

  const tabs = [audioTab, videoTab];
  if (widget === null) tabs.push(profileTab);
  tabs.push(feedbackTab, moreTab);
  if (developerSettingsTab) tabs.push(developerTab);

  return (
    <Modal
      title={t("common.settings")}
      className={styles.settingsModal}
      open={open}
      onDismiss={onDismiss}
    >
      <TabContainer
        onSelectionChange={onTabChange as (tab: Key) => void}
        selectedKey={tab}
        className={styles.tabContainer}
      >
        {tabs}
      </TabContainer>
    </Modal>
  );
};
