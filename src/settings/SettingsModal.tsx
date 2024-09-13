/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { ChangeEvent, FC, ReactNode, useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { Dropdown, Text } from "@vector-im/compound-web";

import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { Tab, TabContainer } from "../tabs/Tabs";
import { FieldRow, InputField } from "../input/Input";
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
  developerSettingsTab as developerSettingsTabSetting,
  duplicateTiles as duplicateTilesSetting,
  useOptInAnalytics,
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

  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
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

    const values = devices.available.map(
      ({ deviceId, label }, index) =>
        [
          deviceId,
          !!label && label.trim().length > 0
            ? label
            : `${caption} ${index + 1}`,
        ] as [string, string],
    );

    return (
      <Dropdown
        label={caption}
        defaultValue={
          devices.selectedId === "" || !devices.selectedId
            ? "default"
            : devices.selectedId
        }
        onValueChange={(id): void => devices.select(id)}
        values={values}
        // XXX This is unused because we set a defaultValue. The component
        // shouldn't require this prop.
        placeholder=""
      />
    );
  };

  const optInDescription = (
    <Text size="sm">
      <Trans i18nKey="settings.opt_in_description">
        <AnalyticsNotice />
        <br />
        You may withdraw consent by unchecking this box. If you are currently in
        a call, this setting will take effect at the end of the call.
      </Trans>
    </Text>
  );

  const devices = useMediaDevices();
  useMediaDeviceNames(devices, open);

  const audioTab: Tab<SettingsTab> = {
    key: "audio",
    name: t("common.audio"),
    content: (
      <>
        {generateDeviceSelection(devices.audioInput, t("common.microphone"))}
        {!isFirefox() &&
          generateDeviceSelection(
            devices.audioOutput,
            t("settings.speaker_device_selection_label"),
          )}
      </>
    ),
  };

  const videoTab: Tab<SettingsTab> = {
    key: "video",
    name: t("common.video"),
    content: generateDeviceSelection(devices.videoInput, t("common.camera")),
  };

  const profileTab: Tab<SettingsTab> = {
    key: "profile",
    name: t("common.profile"),
    content: <ProfileSettingsTab client={client} />,
  };

  const feedbackTab: Tab<SettingsTab> = {
    key: "feedback",
    name: t("settings.feedback_tab_title"),
    content: <FeedbackSettingsTab roomId={roomId} />,
  };

  const moreTab: Tab<SettingsTab> = {
    key: "more",
    name: t("settings.more_tab_title"),
    content: (
      <>
        <h4>{t("settings.developer_tab_title")}</h4>
        <p>
          {t("version", {
            productName: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
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
      </>
    ),
  };

  const developerTab: Tab<SettingsTab> = {
    key: "developer",
    name: t("settings.developer_tab_title"),
    content: (
      <>
        <p>
          {t("version", {
            productName: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
            version: import.meta.env.VITE_APP_VERSION || "dev",
          })}
        </p>
        <p>
          {t("crypto_version", {
            version: client.getCrypto()?.getVersion() || "unknown",
          })}
        </p>
        <p>
          {t("matrix_id", {
            id: client.getUserId() || "unknown",
          })}
        </p>
        <p>
          {t("device_id", {
            id: client.getDeviceId() || "unknown",
          })}
        </p>
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
      </>
    ),
  };

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
      tabbed
    >
      <TabContainer
        label={t("common.settings")}
        tab={tab}
        onTabChange={onTabChange}
        tabs={tabs}
      />
    </Modal>
  );
};
