/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ChangeEvent,
  type FC,
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
  Root as Form,
  Heading,
  HelpMessage,
  InlineField,
  Label,
  RadioControl,
} from "@vector-im/compound-web";

import { FieldRow, InputField } from "../input/Input";
import {
  useSetting,
  duplicateTiles as duplicateTilesSetting,
  debugTileLayout as debugTileLayoutSetting,
  showConnectionStats as showConnectionStatsSetting,
  muteAllAudio as muteAllAudioSetting,
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
  matrixRTCMode as matrixRTCModeSetting,
  customLivekitUrl as customLivekitUrlSetting,
  MatrixRTCMode,
} from "./settings";
import type { Room as LivekitRoom } from "livekit-client";
import styles from "./DeveloperSettingsTab.module.css";
import { useUrlParams } from "../UrlParams";

interface Props {
  client: MatrixClient;
  livekitRooms?: { room: LivekitRoom; url: string; isLocal?: boolean }[];
  env: ImportMetaEnv;
}

export const DeveloperSettingsTab: FC<Props> = ({
  client,
  livekitRooms,
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

  const [showConnectionStats, setShowConnectionStats] = useSetting(
    showConnectionStatsSetting,
  );

  const [alwaysShowIphoneEarpiece, setAlwaysShowIphoneEarpiece] = useSetting(
    alwaysShowIphoneEarpieceSetting,
  );

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
        />{" "}
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
          (e: React.FormEvent<HTMLFormElement>) => {
            setCustomLivekitUrl(
              customLivekitUrlTextBuffer === ""
                ? null
                : customLivekitUrlTextBuffer,
            );
          },
          [setCustomLivekitUrl, customLivekitUrlTextBuffer],
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
      />
      <Heading as="h3" type="body" weight="semibold" size="lg">
        {t("developer_mode.matrixRTCMode.title")}
      </Heading>
      <Form>
        <InlineField
          name={matrixRTCModeRadioGroup}
          control={
            <RadioControl
              checked={matrixRTCMode === MatrixRTCMode.Legacy}
              value={MatrixRTCMode.Legacy}
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
              checked={matrixRTCMode === MatrixRTCMode.Compatibil}
              value={MatrixRTCMode.Compatibil}
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
              checked={matrixRTCMode === MatrixRTCMode.Matrix_2_0}
              value={MatrixRTCMode.Matrix_2_0}
              disabled={!stickyEventsSupported}
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
        <>
          <h3>
            {t("developer_mode.livekit_sfu", {
              url: livekitRoom.url || "unknown",
            })}
          </h3>
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
        </>
      ))}
      <p>{t("developer_mode.environment_variables")}</p>
      <pre>{JSON.stringify(env, null, 2)}</pre>
      <p>{t("developer_mode.url_params")}</p>
      <pre>{JSON.stringify(urlParams, null, 2)}</pre>
    </>
  );
};
