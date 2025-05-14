/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { FieldRow, InputField } from "../input/Input";
import {
  useSetting,
  duplicateTiles as duplicateTilesSetting,
  debugTileLayout as debugTileLayoutSetting,
  showNonMemberTiles as showNonMemberTilesSetting,
  showConnectionStats as showConnectionStatsSetting,
  useNewMembershipManager as useNewMembershipManagerSetting,
  useExperimentalToDeviceTransport as useExperimentalToDeviceTransportSetting,
  muteAllAudio as muteAllAudioSetting,
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
} from "./settings";
import type { MatrixClient } from "matrix-js-sdk";
import type { Room as LivekitRoom } from "livekit-client";
import styles from "./DeveloperSettingsTab.module.css";
import { useUrlParams } from "../UrlParams";
interface Props {
  client: MatrixClient;
  livekitRoom?: LivekitRoom;
}

export const DeveloperSettingsTab: FC<Props> = ({ client, livekitRoom }) => {
  const { t } = useTranslation();
  const [duplicateTiles, setDuplicateTiles] = useSetting(duplicateTilesSetting);
  const [debugTileLayout, setDebugTileLayout] = useSetting(
    debugTileLayoutSetting,
  );
  const [showNonMemberTiles, setShowNonMemberTiles] = useSetting(
    showNonMemberTilesSetting,
  );

  const [showConnectionStats, setShowConnectionStats] = useSetting(
    showConnectionStatsSetting,
  );

  const [useNewMembershipManager, setNewMembershipManager] = useSetting(
    useNewMembershipManagerSetting,
  );

  const [alwaysShowIphoneEarpiece, setAlwaysShowIphoneEarpiece] = useSetting(
    alwaysShowIphoneEarpieceSetting,
  );
  const [
    useExperimentalToDeviceTransport,
    setUseExperimentalToDeviceTransport,
  ] = useSetting(useExperimentalToDeviceTransportSetting);

  const [muteAllAudio, setMuteAllAudio] = useSetting(muteAllAudioSetting);

  const urlParams = useUrlParams();

  const sfuUrl = useMemo((): URL | null => {
    if (livekitRoom?.engine.client.ws?.url) {
      // strip the URL params
      const url = new URL(livekitRoom.engine.client.ws.url);
      url.search = "";
      return url;
    }
    return null;
  }, [livekitRoom]);

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
          id="showNonMemberTiles"
          type="checkbox"
          label={t("developer_mode.show_non_member_tiles")}
          checked={!!showNonMemberTiles}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setShowNonMemberTiles(event.target.checked);
            },
            [setShowNonMemberTiles],
          )}
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
          id="useNewMembershipManager"
          type="checkbox"
          label={t("developer_mode.use_new_membership_manager")}
          checked={!!useNewMembershipManager}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setNewMembershipManager(event.target.checked);
            },
            [setNewMembershipManager],
          )}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="useToDeviceKeyTransport"
          type="checkbox"
          label={t("developer_mode.use_to_device_key_transport")}
          checked={!!useExperimentalToDeviceTransport}
          onChange={useCallback(
            (event: ChangeEvent<HTMLInputElement>): void => {
              setUseExperimentalToDeviceTransport(event.target.checked);
            },
            [setUseExperimentalToDeviceTransport],
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
      {livekitRoom ? (
        <>
          <p>
            {t("developer_mode.livekit_sfu", {
              url: sfuUrl?.href || "unknown",
            })}
          </p>
          <p>{t("developer_mode.livekit_server_info")}</p>
          <pre className={styles.pre}>
            {livekitRoom.serverInfo
              ? JSON.stringify(livekitRoom.serverInfo, null, 2)
              : "undefined"}
            {livekitRoom.metadata}
          </pre>
        </>
      ) : null}
      <p>{t("developer_mode.environment_variables")}</p>
      <pre>{JSON.stringify(import.meta.env, null, 2)}</pre>
      <p>{t("developer_mode.url_params")}</p>
      <pre>{JSON.stringify(urlParams, null, 2)}</pre>
    </>
  );
};
