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

import { ChangeEvent, Key, useCallback, useState } from "react";
import { Item } from "@react-stately/collections";
import { Trans, useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk";
import { useMaybeRoomContext } from "@livekit/components-react";
import { LocalTrack } from "livekit-client";
import { logger } from "matrix-js-sdk/src/logger";

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
import {
  useOptInAnalytics,
  useDeveloperSettingsTab,
  useShowConnectionStats,
  useEnableE2EE,
  isFirefox,
} from "./useSetting";
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

interface Props {
  open: boolean;
  onDismiss: () => void;
  client: MatrixClient;
  roomId?: string;
  defaultTab?: string;
}

export const SettingsModal = (props: Props) => {
  const { t } = useTranslation();

  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  const [developerSettingsTab, setDeveloperSettingsTab] =
    useDeveloperSettingsTab();
  const [showConnectionStats, setShowConnectionStats] =
    useShowConnectionStats();
  const [enableE2EE, setEnableE2EE] = useEnableE2EE();

  const lkRoom = useMaybeRoomContext();

  const getTrackInUse = (sourceName: string): LocalTrack | undefined => {
    if (!lkRoom) return undefined;

    const t = Array.from(lkRoom.localParticipant.audioTracks.values()).find(
      (d) => d.source === sourceName
    );

    return t?.track;
  };

  /**
   * Generate a `SelectInput` with a list of devices for a given device kind.
   * @param devices Info about the available & selected devices from MediaDevicesContext
   * @param caption Device caption to be used if no labels available
   * @param lkSource The livekit source name for this device type, eg. 'microphone': used to match up
   *                 devices used by tracks in a current room (if any).
   */
  const generateDeviceSelection = (
    devices: MediaDevice,
    caption: string,
    lkSource?: string
  ) => {
    if (devices.available.length == 0) return null;

    const trackUsedByRoom = lkSource ? getTrackInUse(lkSource) : undefined;

    let selectedKey = devices.selectedId;
    // We may present a different device as the currently selected one if we have an active track
    // from the default device, because the default device of the OS may have changed since we acquired the
    // track, but EC did not update the track to match the new default in which case we want to display the
    // one we're actually using rather than what the default is now. We only do this if we've selected, and
    // are using, the default device
    if (
      trackUsedByRoom &&
      (devices.selectedId === "" ||
        !devices.selectedId ||
        devices.selectedId === "default") &&
      trackUsedByRoom.mediaStreamTrack.getSettings().deviceId === "default"
    ) {
      // we work out what the actual device is based on groupId, but this only works if
      // there is only one such device with the same group ID, which there won't be if
      // we're using hardware with multiple sub-devices (eg. a multitrack soundcard)
      const usedGroupId =
        trackUsedByRoom?.mediaStreamTrack.getSettings().groupId;
      const defaultGroupId = devices.available.find(
        (d) => d.deviceId === "default"
      )?.groupId;

      // If the device we're actually using doesn't match tne group ID of what the default is
      // now, then display a different one.
      if (usedGroupId !== defaultGroupId) {
        const devicesWithMatchingGroupId = devices.available.filter(
          (d) => d.groupId === usedGroupId && d.deviceId !== "default"
        );

        // One final check: check that there is only one such device matching the group ID.
        // If not, we simply can't match up the device correctly: we don't have enough info.
        if (devicesWithMatchingGroupId.length === 1) {
          logger.info(
            `Current default device doesn't appear to match device in use: selecting ${devicesWithMatchingGroupId[0].label}`
          );
          selectedKey = devicesWithMatchingGroupId[0].deviceId;
        }
      }
    }

    const getLabel = (device: MediaDeviceInfo, index: number) => {
      /*if (selected && trackUsedByRoom) {
        return trackUsedByRoom.label.trim();
      }*/
      return !!device.label && device.label.trim().length > 0
        ? device.label
        : `${caption} ${index + 1}`;
    };

    return (
      <SelectInput
        label={caption}
        selectedKey={selectedKey}
        onSelectionChange={(id) => devices.select(id.toString())}
      >
        {devices.available.map((d, index) => (
          <Item key={d.deviceId}>{getLabel(d, index)}</Item>
        ))}
      </SelectInput>
    );
  };

  const [selectedTab, setSelectedTab] = useState<string | undefined>();

  const onSelectedTabChanged = useCallback(
    (tab: Key) => {
      setSelectedTab(tab.toString());
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

  const devices = useMediaDevices();
  useMediaDeviceNames(devices, props.open);

  const audioTab = (
    <TabItem
      key="audio"
      title={
        <>
          <AudioIcon width={16} height={16} />
          <span className={styles.tabLabel}>{t("Audio")}</span>
        </>
      }
    >
      {generateDeviceSelection(
        devices.audioInput,
        t("Microphone"),
        "microphone"
      )}
      {!isFirefox() &&
        generateDeviceSelection(devices.audioOutput, t("Speaker"))}
    </TabItem>
  );

  const videoTab = (
    <TabItem
      key="video"
      title={
        <>
          <VideoIcon width={16} height={16} />
          <span>{t("Video")}</span>
        </>
      }
    >
      {generateDeviceSelection(devices.videoInput, t("Camera"))}
    </TabItem>
  );

  const profileTab = (
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
  );

  const feedbackTab = (
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
  );

  const moreTab = (
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
      <p>Version: {(import.meta.env.VITE_APP_VERSION as string) || "dev"}</p>
      <FieldRow>
        <InputField
          id="developerSettingsTab"
          type="checkbox"
          checked={developerSettingsTab}
          label={t("Developer Settings")}
          description={t("Expose developer settings in the settings window.")}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setDeveloperSettingsTab(event.target.checked)
          }
        />
      </FieldRow>
      <h4>Analytics</h4>
      <FieldRow>
        <InputField
          id="optInAnalytics"
          type="checkbox"
          checked={optInAnalytics ?? undefined}
          description={optInDescription}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
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
          id="showConnectionStats"
          name="connection-stats"
          label={t("Show connection stats")}
          type="checkbox"
          checked={showConnectionStats}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setShowConnectionStats(e.target.checked)
          }
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="enableE2EE"
          name="end-to-end-encryption"
          label={t("Enable end-to-end encryption (password protected calls)")}
          description={
            !setEnableE2EE &&
            t("End-to-end encryption isn't supported on your browser.")
          }
          disabled={!setEnableE2EE}
          type="checkbox"
          checked={enableE2EE ?? undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setEnableE2EE?.(e.target.checked)
          }
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
      title={t("Settings")}
      className={styles.settingsModal}
      open={props.open}
      onDismiss={props.onDismiss}
    >
      <TabContainer
        onSelectionChange={onSelectedTabChanged}
        selectedKey={selectedTab ?? props.defaultTab ?? "audio"}
        className={styles.tabContainer}
      >
        {tabs}
      </TabContainer>
    </Modal>
  );
};
