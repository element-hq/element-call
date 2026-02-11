/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MatrixClient } from "matrix-js-sdk";
import { Button, Root as Form, Separator } from "@vector-im/compound-web";
import { type Room as LivekitRoom } from "livekit-client";

import { Modal } from "../Modal";
import styles from "./SettingsModal.module.css";
import { type Tab, TabContainer } from "../tabs/Tabs";
import { ProfileSettingsTab } from "./ProfileSettingsTab";
import { FeedbackSettingsTab } from "./FeedbackSettingsTab";
import { iosDeviceMenu$ } from "../state/MediaDevices";
import { useMediaDevices } from "../MediaDevicesContext";
import { widget } from "../widget";
import {
  useSetting,
  soundEffectVolume as soundEffectVolumeSetting,
  backgroundBlur as backgroundBlurSetting,
  developerMode,
  advancedScreenShare as advancedScreenShareSetting,
  screenShareResolution as screenShareResolutionSetting,
  screenShareFramerate as screenShareFramerateSetting,
  screenShareBitrate as screenShareBitrateSetting,
  screenShareCodec as screenShareCodecSetting,
  type VideoCodec,
} from "./settings";
import { PreferencesSettingsTab } from "./PreferencesSettingsTab";
import { Slider } from "../Slider";
import { DeviceSelection } from "./DeviceSelection";
import { useTrackProcessor } from "../livekit/TrackProcessorContext";
import { DeveloperSettingsTab } from "./DeveloperSettingsTab";
import { FieldRow, InputField } from "../input/Input";
import { useSubmitRageshake } from "./submit-rageshake";
import { useUrlParams } from "../UrlParams";
import { useBehavior } from "../useBehavior";

type SettingsTab =
  | "audio"
  | "video"
  | "profile"
  | "preferences"
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
  livekitRooms?: {
    room: LivekitRoom;
    url: string;
    isLocal?: boolean;
  }[];
}

export const defaultSettingsTab: SettingsTab = "audio";

export const SettingsModal: FC<Props> = ({
  open,
  onDismiss,
  tab,
  onTabChange,
  client,
  roomId,
  livekitRooms,
}) => {
  const { t } = useTranslation();

  // Generate a `Checkbox` input to turn blur on or off.
  const BlurCheckbox: React.FC = (): ReactNode => {
    const { supported } = useTrackProcessor();

    const [blurActive, setBlurActive] = useSetting(backgroundBlurSetting);

    return (
      <>
        <h4>{t("settings.background_blur_header")}</h4>

        <FieldRow>
          <InputField
            id="activateBackgroundBlur"
            label={t("settings.background_blur_label")}
            description={
              supported ? "" : t("settings.blur_not_supported_by_browser")
            }
            type="checkbox"
            checked={!!blurActive}
            onChange={(b): void => setBlurActive(b.target.checked)}
            disabled={!supported}
          />
        </FieldRow>
      </>
    );
  };

  const ScreenShareSettings: React.FC = (): ReactNode => {
    const [advancedEnabled, setAdvancedEnabled] = useSetting(
      advancedScreenShareSetting,
    );
    const [resolution, setResolution] = useSetting(
      screenShareResolutionSetting,
    );
    const [framerate, setFramerate] = useSetting(screenShareFramerateSetting);
    const [framerateRaw, setFramerateRaw] = useState(framerate);
    const [bitrate, setBitrate] = useSetting(screenShareBitrateSetting);
    const [bitrateRaw, setBitrateRaw] = useState(bitrate);
    const [codec, setCodec] = useSetting(screenShareCodecSetting);

    return (
      <>
        <h4>{t("settings.screen_share_header", "Screen sharing")}</h4>
        <FieldRow>
          <InputField
            id="advancedScreenShare"
            label={t(
              "settings.advanced_screen_share_label",
              "Advanced screen share settings",
            )}
            description={t(
              "settings.advanced_screen_share_description",
              "Configure resolution, framerate, bitrate, and codec for screen sharing",
            )}
            type="checkbox"
            checked={advancedEnabled}
            onChange={(e): void => setAdvancedEnabled(e.target.checked)}
          />
        </FieldRow>
        {advancedEnabled && (
          <>
            <FieldRow>
              <InputField
                id="screenShareResolution"
                label={t(
                  "settings.screen_share_resolution_label",
                  "Resolution",
                )}
                type="select"
                value={resolution}
                onChange={(e): void => setResolution(e.target.value)}
              >
                <option value="1024x576">576p</option>
                <option value="1280x720">720p</option>
                <option value="1920x1080">1080p</option>
                <option value="2560x1440">1440p</option>
                <option value="3840x2160">4K</option>
              </InputField>
            </FieldRow>
            <div className={styles.volumeSlider}>
              <label>
                {t("settings.screen_share_framerate_label", "Framerate")}
              </label>
              <Slider
                label={t("settings.screen_share_framerate_label", "Framerate")}
                value={framerateRaw}
                onValueChange={setFramerateRaw}
                onValueCommit={setFramerate}
                min={5}
                max={60}
                step={5}
                tooltipFormatter={(v): string => `${v} fps`}
              />
            </div>
            <div className={styles.volumeSlider}>
              <label>
                {t("settings.screen_share_bitrate_label", "Bitrate")}
              </label>
              <Slider
                label={t("settings.screen_share_bitrate_label", "Bitrate")}
                value={bitrateRaw}
                onValueChange={setBitrateRaw}
                onValueCommit={setBitrate}
                min={500_000}
                max={15_000_000}
                step={500_000}
                tooltipFormatter={(v): string =>
                  `${(v / 1_000_000).toFixed(1)} Mbps`
                }
              />
            </div>
            <FieldRow>
              <InputField
                id="screenShareCodec"
                label={t("settings.screen_share_codec_label", "Codec")}
                type="select"
                value={codec}
                onChange={(e): void => setCodec(e.target.value as VideoCodec)}
              >
                <option value="vp8">VP8</option>
                <option value="vp9">VP9</option>
                <option value="h264">H.264</option>
                <option value="av1">AV1</option>
              </InputField>
            </FieldRow>
          </>
        )}
      </>
    );
  };

  const devices = useMediaDevices();
  useEffect(() => {
    if (open) devices.requestDeviceNames();
  }, [open, devices]);

  const [soundVolume, setSoundVolume] = useSetting(soundEffectVolumeSetting);
  const [soundVolumeRaw, setSoundVolumeRaw] = useState(soundVolume);
  const [showDeveloperSettingsTab] = useSetting(developerMode);

  const { available: isRageshakeAvailable } = useSubmitRageshake();

  // For controlled devices, we will not show the input section:
  // Controlled media devices are used on mobile platforms, where input and output are grouped into
  // a single device. These are called "headset" or "speaker" (or similar) but contain both input and output.
  // On EC, we decided that it is less confusing for the user if they see those options in the output section
  // rather than the input section.
  const { controlledAudioDevices } = useUrlParams();
  // If we are on iOS we will show a button to open the native audio device picker.
  const iosDeviceMenu = useBehavior(iosDeviceMenu$);

  const audioTab: Tab<SettingsTab> = {
    key: "audio",
    name: t("common.audio"),
    content: (
      <>
        <Form>
          {!controlledAudioDevices && (
            <DeviceSelection
              device={devices.audioInput}
              title={t("settings.devices.microphone")}
              numberedLabel={(n) =>
                t("settings.devices.microphone_numbered", { n })
              }
            />
          )}
          {iosDeviceMenu && controlledAudioDevices && (
            <Button
              onClick={(e): void => {
                e.preventDefault();
                window.controls.showNativeAudioDevicePicker?.();
                // call deprecated method for backwards compatibility.
                window.controls.showNativeOutputDevicePicker?.();
              }}
            >
              {t("settings.devices.change_device_button")}
            </Button>
          )}
          <DeviceSelection
            device={devices.audioOutput}
            title={t("settings.devices.speaker")}
            numberedLabel={(n) => t("settings.devices.speaker_numbered", { n })}
          />

          <div className={styles.volumeSlider}>
            <label>{t("settings.audio_tab.effect_volume_label")}</label>
            <p>{t("settings.audio_tab.effect_volume_description")}</p>
            <Slider
              label={t("video_tile.volume")}
              value={soundVolumeRaw}
              onValueChange={setSoundVolumeRaw}
              onValueCommit={setSoundVolume}
              min={0}
              max={1}
              step={0.01}
            />
          </div>
        </Form>
      </>
    ),
  };

  const videoTab: Tab<SettingsTab> = {
    key: "video",
    name: t("common.video"),
    content: (
      <>
        <Form>
          <DeviceSelection
            device={devices.videoInput}
            title={t("settings.devices.camera")}
            numberedLabel={(n) => t("settings.devices.camera_numbered", { n })}
          />
        </Form>
        <Separator />
        <BlurCheckbox />
        <Separator />
        <ScreenShareSettings />
      </>
    ),
  };

  const preferencesTab: Tab<SettingsTab> = {
    key: "preferences",
    name: t("common.preferences"),
    content: <PreferencesSettingsTab />,
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

  const developerTab: Tab<SettingsTab> = {
    key: "developer",
    name: t("settings.developer_tab_title"),
    content: (
      <DeveloperSettingsTab
        env={import.meta.env}
        client={client}
        livekitRooms={livekitRooms}
      />
    ),
  };

  const tabs = [audioTab, videoTab];
  if (widget === null) tabs.push(profileTab);
  tabs.push(preferencesTab);
  if (isRageshakeAvailable || import.meta.env.VITE_PACKAGE === "full") {
    // for full package we want to show the analytics consent checkbox
    // even if rageshake is not available
    tabs.push(feedbackTab);
  }
  if (showDeveloperSettingsTab) tabs.push(developerTab);

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
