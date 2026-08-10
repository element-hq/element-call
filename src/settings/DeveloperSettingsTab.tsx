/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ChangeEvent,
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  UNSTABLE_MSC4354_STICKY_EVENTS,
  type MatrixClient,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  EditInPlace,
  ErrorMessage,
  Root as Form,
  Heading,
  HelpMessage,
  InlineField,
  Label,
  RadioControl,
  Separator,
} from "@vector-im/compound-web";
import { type Room as LivekitRoom } from "livekit-client";

import { FieldRow, InputField } from "../input/Input";
import { Config } from "../config/Config";
import {
  type Setting,
  useSetting,
  duplicateTiles as duplicateTilesSetting,
  debugTileLayout as debugTileLayoutSetting,
  showConnectionStats as showConnectionStatsSetting,
  muteAllAudio as muteAllAudioSetting,
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
  matrixRTCMode as matrixRTCModeSetting,
  customLivekitUrl as customLivekitUrlSetting,
  advancedScreenShare as advancedScreenShareSetting,
  screenShareResolution as screenShareResolutionSetting,
  screenShareFramerate as screenShareFramerateSetting,
  screenShareBitrate as screenShareBitrateSetting,
  screenShareCodec as screenShareCodecSetting,
  advancedCamera as advancedCameraSetting,
  cameraResolution as cameraResolutionSetting,
  cameraFramerate as cameraFramerateSetting,
  cameraBitrate as cameraBitrateSetting,
  cameraCodec as cameraCodecSetting,
  echoCancellationSetting,
  noiseSuppressionSetting,
  autoGainControlSetting,
  type VideoCodec,
  enableExtendedLivekitLogs as enableExtendedLivekitLogsSetting,
} from "./settings";
import { MatrixRTCMode } from "../config/ConfigOptions";
import styles from "./DeveloperSettingsTab.module.css";
import settingsStyles from "./SettingsModal.module.css";
import { Slider } from "../Slider";
import { useUrlParams } from "../UrlParams";
import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";

interface Props {
  client: MatrixClient;
  roomId?: string;
  livekitRooms?: {
    room: LivekitRoom;
    url: string;
    isLocal?: boolean;
    livekitAlias?: string;
  }[];
  env: ImportMetaEnv;
}

export const DeveloperSettingsTab: FC<Props> = ({
  client,
  livekitRooms,
  roomId,
  env,
}) => {
  const { t } = useTranslation();
  const [duplicateTiles, setDuplicateTiles] = useSetting(duplicateTilesSetting);
  const [debugTileLayout, setDebugTileLayout] = useSetting(
    debugTileLayoutSetting,
  );

  const [stickyEventsSupported, setStickyEventsSupported] = useState(false);
  useEffect(() => {
    client
      .doesServerSupportUnstableFeature(UNSTABLE_MSC4354_STICKY_EVENTS)
      .then((result) => {
        setStickyEventsSupported(result);
      })
      .catch((ex) => {
        logger.warn("Failed to check if sticky events are supported", ex);
      });
  }, [client]);

  const [matrixRTCMode, setMatrixRTCMode] = useSetting(matrixRTCModeSetting);
  const matrixRTCModeRadioGroup = useId();
  const onMatrixRTCModeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setMatrixRTCMode(e.target.value as MatrixRTCMode);
    },
    [setMatrixRTCMode],
  );
  const configMatrixRTCMode = Config.get().matrix_rtc_mode as
    | MatrixRTCMode
    | undefined;
  const matrixRTCModeForced = configMatrixRTCMode !== undefined;
  const effectiveMatrixRTCMode = configMatrixRTCMode ?? matrixRTCMode;

  const [showConnectionStats, setShowConnectionStats] = useSetting(
    showConnectionStatsSetting,
  );

  const [alwaysShowIphoneEarpiece, setAlwaysShowIphoneEarpiece] = useSetting(
    alwaysShowIphoneEarpieceSetting,
  );

  const [enableExtendedLivekitLogs, setEnableExtendedLivekitLogs] = useSetting(
    enableExtendedLivekitLogsSetting,
  );

  const [customLivekitUrlUpdateError, setCustomLivekitUrlUpdateError] =
    useState<string | null>(null);
  const [customLivekitUrl, setCustomLivekitUrl] = useSetting(
    customLivekitUrlSetting,
  );
  const [customLivekitUrlTextBuffer, setCustomLivekitUrlTextBuffer] =
    useState(customLivekitUrl);
  useEffect(() => {
    setCustomLivekitUrlTextBuffer(customLivekitUrl);
  }, [customLivekitUrl]);

  const [muteAllAudio, setMuteAllAudio] = useSetting(muteAllAudioSetting);

  const urlParams = useUrlParams();

  const localSfuUrl = useMemo((): URL | null => {
    const localRoom = livekitRooms?.find((r) => r.isLocal)?.room;
    if (localRoom?.engine.client.ws?.url) {
      // strip the URL params
      const url = new URL(localRoom.engine.client.ws.url);
      url.search = "";
      return url;
    }
    return null;
  }, [livekitRooms]);

  const MediaQualitySettings: React.FC<{
    id: string;
    header: string;
    toggleLabel: string;
    description: string;
    toggleSetting: Setting<boolean>;
    resolutionSetting: Setting<string>;
    framerateSetting: Setting<number>;
    bitrateSetting: Setting<number>;
    codecSetting: Setting<VideoCodec>;
    resolutionOptions: { value: string; label: string }[];
    bitrateRange: { min: number; max: number; step: number };
  }> = ({
    id,
    header,
    toggleLabel,
    description,
    toggleSetting,
    resolutionSetting,
    framerateSetting,
    bitrateSetting,
    codecSetting,
    resolutionOptions,
    bitrateRange,
  }): ReactNode => {
    const [advancedEnabled, setAdvancedEnabled] = useSetting(toggleSetting);
    const [resolution, setResolution] = useSetting(resolutionSetting);
    const [framerate, setFramerate] = useSetting(framerateSetting);
    const [framerateRaw, setFramerateRaw] = useState(framerate);
    const [bitrate, setBitrate] = useSetting(bitrateSetting);
    const [bitrateRaw, setBitrateRaw] = useState(bitrate);
    const [codec, setCodec] = useSetting(codecSetting);

    return (
      <>
        <h4>{header}</h4>
        <FieldRow>
          <InputField
            id={`${id}Toggle`}
            label={toggleLabel}
            description={description}
            type="checkbox"
            checked={advancedEnabled}
            onChange={(e): void => setAdvancedEnabled(e.target.checked)}
          />
        </FieldRow>
        {advancedEnabled && (
          <>
            <div className={settingsStyles.volumeSlider}>
              <label htmlFor={`${id}Resolution`}>
                {t("settings.resolution_label", "Resolution")}
              </label>
              <select
                id={`${id}Resolution`}
                value={resolution}
                onChange={(e): void => setResolution(e.target.value)}
              >
                {resolutionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={settingsStyles.volumeSlider}>
              <label>
                {t("settings.framerate_label", "Framerate")}
                {": "}
                <span className={settingsStyles.settingValue}>
                  {framerateRaw} fps
                </span>
              </label>
              <Slider
                label={t("settings.framerate_label", "Framerate")}
                value={framerateRaw}
                onValueChange={setFramerateRaw}
                onValueCommit={setFramerate}
                min={5}
                max={60}
                step={5}
                tooltipFormatter={(v): string => `${v} fps`}
              />
            </div>
            <div className={settingsStyles.volumeSlider}>
              <label>
                {t("settings.bitrate_label", "Bitrate")}
                {": "}
                <span className={settingsStyles.settingValue}>
                  {(bitrateRaw / 1_000_000).toFixed(1)} Mbps
                </span>
              </label>
              <Slider
                label={t("settings.bitrate_label", "Bitrate")}
                value={bitrateRaw}
                onValueChange={setBitrateRaw}
                onValueCommit={setBitrate}
                min={bitrateRange.min}
                max={bitrateRange.max}
                step={bitrateRange.step}
                tooltipFormatter={(v): string =>
                  `${(v / 1_000_000).toFixed(1)} Mbps`
                }
              />
            </div>
            <div className={settingsStyles.volumeSlider}>
              <label htmlFor={`${id}Codec`}>
                {t("settings.codec_label", "Codec")}
              </label>
              <select
                id={`${id}Codec`}
                value={codec}
                onChange={(e): void => setCodec(e.target.value as VideoCodec)}
              >
                <option value="vp8">VP8</option>
                <option value="vp9">VP9</option>
                <option value="h264">H.264</option>
                <option value="av1">AV1</option>
              </select>
            </div>
          </>
        )}
      </>
    );
  };

  const AudioProcessingSettings: React.FC = (): ReactNode => {
    const [echoCancellation, setEchoCancellation] = useSetting(
      echoCancellationSetting,
    );
    const [noiseSuppression, setNoiseSuppression] = useSetting(
      noiseSuppressionSetting,
    );
    const [autoGainControl, setAutoGainControl] = useSetting(
      autoGainControlSetting,
    );

    return (
      <>
        <h4>{t("settings.audio_processing_header", "Audio processing")}</h4>
        <p>
          {t(
            "settings.audio_processing_description",
            "Changes apply on next call join.",
          )}
        </p>
        <FieldRow>
          <InputField
            id="echoCancellation"
            label={t("settings.echo_cancellation_label", "Echo cancellation")}
            type="checkbox"
            checked={echoCancellation}
            onChange={(e): void => setEchoCancellation(e.target.checked)}
          />
        </FieldRow>
        <FieldRow>
          <InputField
            id="noiseSuppression"
            label={t("settings.noise_suppression_label", "Noise suppression")}
            type="checkbox"
            checked={noiseSuppression}
            onChange={(e): void => setNoiseSuppression(e.target.checked)}
          />
        </FieldRow>
        <FieldRow>
          <InputField
            id="autoGainControl"
            label={t(
              "settings.auto_gain_control_label",
              "Automatic gain control",
            )}
            type="checkbox"
            checked={autoGainControl}
            onChange={(e): void => setAutoGainControl(e.target.checked)}
          />
        </FieldRow>
      </>
    );
  };

  return (
    <>
      <p>
        {t("developer_mode.hostname", {
          hostname: window.location.hostname || "unknown",
        })}
      </p>
      <p>
        {t("version", {
          productName: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
          version: import.meta.env.VITE_APP_VERSION || "dev",
        })}
      </p>
      <p>
        {t("developer_mode.crypto_version", {
          version: client.getCrypto()?.getVersion() || "unknown",
        })}
      </p>
      <p>
        {t("developer_mode.matrix_id", {
          id: client.getUserId() || "unknown",
        })}
      </p>
      <p>
        {t("developer_mode.device_id", {
          id: client.getDeviceId() || "unknown",
        })}
      </p>
      <Separator />
      <FieldRow>
        <InputField
          id="duplicateTiles"
          type="number"
          label={t("developer_mode.duplicate_tiles_label")}
          value={duplicateTiles.toString()}
          min={0}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              const value = event.target.valueAsNumber;
              if (value < 0) {
                return;
              }
              setDuplicateTiles(Number.isNaN(value) ? 0 : value);
            },
            [setDuplicateTiles],
          )}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="debugTileLayout"
          type="checkbox"
          checked={debugTileLayout}
          label={t("developer_mode.debug_tile_layout_label")}
          onChange={(event: ChangeEvent<HTMLInputElement>): void =>
            setDebugTileLayout(event.target.checked)
          }
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="showConnectionStats"
          type="checkbox"
          label={t("developer_mode.show_connection_stats")}
          checked={!!showConnectionStats}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setShowConnectionStats(event.target.checked);
            },
            [setShowConnectionStats],
          )}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="muteAllAudio"
          type="checkbox"
          label={t("developer_mode.mute_all_audio")}
          checked={muteAllAudio}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setMuteAllAudio(event.target.checked);
            },
            [setMuteAllAudio],
          )}
        />
      </FieldRow>{" "}
      <FieldRow>
        <InputField
          id="alwaysShowIphoneEarpiece"
          type="checkbox"
          label={t("developer_mode.always_show_iphone_earpiece")}
          checked={alwaysShowIphoneEarpiece}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setAlwaysShowIphoneEarpiece(event.target.checked);
            },
            [setAlwaysShowIphoneEarpiece],
          )}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="enableLivekitExtendedLogs"
          type="checkbox"
          label="Enable extended livekit logs"
          checked={enableExtendedLivekitLogs}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setEnableExtendedLivekitLogs(event.target.checked);
            },
            [setEnableExtendedLivekitLogs],
          )}
        />
      </FieldRow>
      <EditInPlace
        onSubmit={(e) => e.preventDefault()}
        helpLabel={
          customLivekitUrl === null
            ? t("developer_mode.custom_livekit_url.from_config")
            : t("developer_mode.custom_livekit_url.current_url") +
              customLivekitUrl
        }
        label={t("developer_mode.custom_livekit_url.label")}
        saveButtonLabel={t("developer_mode.custom_livekit_url.save")}
        savingLabel={t("developer_mode.custom_livekit_url.saving")}
        cancelButtonLabel={t("developer_mode.custom_livekit_url.reset")}
        onSave={useCallback(
          async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
            if (
              roomId === undefined ||
              customLivekitUrlTextBuffer === "" ||
              customLivekitUrlTextBuffer === null
            ) {
              setCustomLivekitUrl(null);
              return;
            }

            try {
              const userId = client.getUserId();
              const deviceId = client.getDeviceId();

              if (userId === null || deviceId === null) {
                throw new Error("Invalid user or device ID");
              }
              await getSFUConfigWithOpenID(
                client,
                { userId, deviceId, memberId: "" },
                customLivekitUrlTextBuffer,
                roomId,
              );
              setCustomLivekitUrlUpdateError(null);
              setCustomLivekitUrl(customLivekitUrlTextBuffer);
            } catch {
              setCustomLivekitUrlUpdateError("invalid URL (did not update)");
            }
          },
          [customLivekitUrlTextBuffer, setCustomLivekitUrl, client, roomId],
        )}
        value={customLivekitUrlTextBuffer ?? ""}
        onChange={useCallback(
          (event: ChangeEvent<HTMLInputElement>): void => {
            setCustomLivekitUrlTextBuffer(event.target.value);
          },
          [setCustomLivekitUrlTextBuffer],
        )}
        onCancel={useCallback(
          (e: React.FormEvent<HTMLFormElement>) => {
            setCustomLivekitUrl(null);
          },
          [setCustomLivekitUrl],
        )}
        serverInvalid={customLivekitUrlUpdateError !== null}
      >
        {customLivekitUrlUpdateError !== null && (
          <ErrorMessage>{customLivekitUrlUpdateError}</ErrorMessage>
        )}
      </EditInPlace>
      <Separator />
      <Heading as="h3" type="body" weight="semibold" size="lg">
        {t("developer_mode.matrixRTCMode.title")}
      </Heading>
      {matrixRTCModeForced && <p>Your deployment overrides the mode.</p>}
      <Form>
        <InlineField
          name={matrixRTCModeRadioGroup}
          control={
            <RadioControl
              checked={effectiveMatrixRTCMode === MatrixRTCMode.Legacy}
              value={MatrixRTCMode.Legacy}
              disabled={matrixRTCModeForced}
              onChange={onMatrixRTCModeChange}
            />
          }
        >
          <Label>{t("developer_mode.matrixRTCMode.Legacy.label")}</Label>
          <HelpMessage>
            {t("developer_mode.matrixRTCMode.Legacy.description")}
          </HelpMessage>
        </InlineField>
        <InlineField
          name={matrixRTCModeRadioGroup}
          control={
            <RadioControl
              checked={effectiveMatrixRTCMode === MatrixRTCMode.Compatibility}
              value={MatrixRTCMode.Compatibility}
              disabled={matrixRTCModeForced}
              onChange={onMatrixRTCModeChange}
            />
          }
        >
          <Label>{t("developer_mode.matrixRTCMode.Comptibility.label")}</Label>
          <HelpMessage>
            {t("developer_mode.matrixRTCMode.Comptibility.description")}
          </HelpMessage>
        </InlineField>
        <InlineField
          name={matrixRTCModeRadioGroup}
          control={
            <RadioControl
              checked={effectiveMatrixRTCMode === MatrixRTCMode.Matrix_2_0}
              value={MatrixRTCMode.Matrix_2_0}
              disabled={matrixRTCModeForced || !stickyEventsSupported}
              onChange={onMatrixRTCModeChange}
            />
          }
        >
          <Label>{t("developer_mode.matrixRTCMode.Matrix_2_0.label")}</Label>
          <HelpMessage>
            {t("developer_mode.matrixRTCMode.Matrix_2_0.description")}
          </HelpMessage>
        </InlineField>
      </Form>
      {livekitRooms?.map((livekitRoom) => (
        <div className={styles.livekit_room_box}>
          <h4>
            {t("developer_mode.livekit_sfu", {
              url: livekitRoom.url || "unknown",
            })}
          </h4>
          <p>LivekitAlias: {livekitRoom.livekitAlias}</p>
          <p>connectionState (wont hot reload): {livekitRoom.room.state}</p>
          {livekitRoom.isLocal && <p>ws-url: {localSfuUrl?.href}</p>}
          <p>
            {t("developer_mode.livekit_server_info")}(
            {livekitRoom.isLocal ? "local" : "remote"})
          </p>
          <pre className={styles.pre}>
            {livekitRoom.room.serverInfo
              ? JSON.stringify(livekitRoom.room.serverInfo, null, 2)
              : "undefined"}
            {livekitRoom.room.metadata}
          </pre>
          <p>Local Participant</p>
          <pre className={styles.pre}>
            {livekitRoom.room.localParticipant.identity}
          </pre>
          <p>Remote Participants</p>
          <ul>
            {Array.from(livekitRoom.room.remoteParticipants.keys()).map(
              (id) => (
                <li key={id}>{id}</li>
              ),
            )}
          </ul>
        </div>
      ))}
      <Separator />
      <MediaQualitySettings
        id="camera"
        header={t("settings.camera_header", "Camera quality")}
        toggleLabel={t(
          "settings.advanced_camera_label",
          "Advanced camera settings",
        )}
        description={t(
          "settings.advanced_camera_description",
          "Configure resolution, framerate, bitrate, and codec for camera video. Changes apply on next call join.",
        )}
        toggleSetting={advancedCameraSetting}
        resolutionSetting={cameraResolutionSetting}
        framerateSetting={cameraFramerateSetting}
        bitrateSetting={cameraBitrateSetting}
        codecSetting={cameraCodecSetting}
        resolutionOptions={[
          { value: "640x360", label: "360p" },
          { value: "960x540", label: "540p" },
          { value: "1280x720", label: "720p" },
          { value: "1920x1080", label: "1080p" },
          { value: "2560x1440", label: "1440p" },
        ]}
        bitrateRange={{ min: 200_000, max: 8_000_000, step: 100_000 }}
      />
      <Separator />
      <MediaQualitySettings
        id="screenShare"
        header={t("settings.screen_share_header", "Screen sharing")}
        toggleLabel={t(
          "settings.advanced_screen_share_label",
          "Advanced screen share settings",
        )}
        description={t(
          "settings.advanced_screen_share_description",
          "Configure resolution, framerate, bitrate, and codec for screen sharing",
        )}
        toggleSetting={advancedScreenShareSetting}
        resolutionSetting={screenShareResolutionSetting}
        framerateSetting={screenShareFramerateSetting}
        bitrateSetting={screenShareBitrateSetting}
        codecSetting={screenShareCodecSetting}
        resolutionOptions={[
          { value: "1024x576", label: "576p" },
          { value: "1280x720", label: "720p" },
          { value: "1920x1080", label: "1080p" },
          { value: "2560x1440", label: "1440p" },
          { value: "3840x2160", label: "4K" },
        ]}
        bitrateRange={{ min: 500_000, max: 15_000_000, step: 500_000 }}
      />
      <Separator />
      <AudioProcessingSettings />
      <Separator />
      <p>{t("developer_mode.environment_variables")}</p>
      <pre>{JSON.stringify(env, null, 2)}</pre>
      <p>{t("developer_mode.url_params")}</p>
      <pre>{JSON.stringify(urlParams, null, 2)}</pre>
    </>
  );
};
