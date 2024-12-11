/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { Button } from "@vector-im/compound-web";
import classNames from "classnames";
import { useHistory } from "react-router-dom";
import { logger } from "matrix-js-sdk/src/logger";
import { usePreviewTracks } from "@livekit/components-react";
import {
  type CreateLocalTracksOptions,
  type LocalVideoTrack,
  Track,
} from "livekit-client";
import { useObservable } from "observable-hooks";
import { map } from "rxjs";

import inCallStyles from "./InCallView.module.css";
import styles from "./LobbyView.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useLocationNavigation } from "../useLocationNavigation";
import { type MatrixInfo, VideoPreview } from "./VideoPreview";
import { type MuteStates } from "./MuteStates";
import { InviteButton } from "../button/InviteButton";
import {
  EndCallButton,
  MicButton,
  SettingsButton,
  SwitchCameraButton,
  VideoButton,
} from "../button/Button";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useMediaQuery } from "../useMediaQuery";
import { E2eeType } from "../e2ee/e2eeType";
import { Link } from "../button/Link";
import { useMediaDevices } from "../livekit/MediaDevicesContext";
import { useInitial } from "../useInitial";
import { useSwitchCamera as useShowSwitchCamera } from "./useSwitchCamera";
import {
  useTrackProcessor,
  useTrackProcessorSync,
} from "../livekit/TrackProcessorContext";

interface Props {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  onEnter: () => void;
  enterLabel?: JSX.Element | string;
  confineToRoom: boolean;
  hideHeader: boolean;
  participantCount: number | null;
  onShareClick: (() => void) | null;
  waitingForInvite?: boolean;
}

export const LobbyView: FC<Props> = ({
  client,
  matrixInfo,
  muteStates,
  onEnter,
  enterLabel,
  confineToRoom,
  hideHeader,
  participantCount,
  onShareClick,
  waitingForInvite,
}) => {
  const { t } = useTranslation();
  useLocationNavigation();

  const onAudioPress = useCallback(
    () => muteStates.audio.setEnabled?.((e) => !e),
    [muteStates],
  );
  const onVideoPress = useCallback(
    () => muteStates.video.setEnabled?.((e) => !e),
    [muteStates],
  );

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const history = useHistory();
  const onLeaveClick = useCallback(() => history.push("/"), [history]);

  const recentsButtonInFooter = useMediaQuery("(max-height: 500px)");
  const recentsButton = !confineToRoom && (
    <Link className={styles.recents} to="/">
      {t("lobby.leave_button")}
    </Link>
  );

  const devices = useMediaDevices();

  // Capture the audio options as they were when we first mounted, because
  // we're not doing anything with the audio anyway so we don't need to
  // re-open the devices when they change (see below).
  const initialAudioOptions = useInitial(
    () =>
      muteStates.audio.enabled && { deviceId: devices.audioInput.selectedId },
  );

  const { processor } = useTrackProcessor() || {};

  const initialProcessor = useInitial(() => processor);
  const localTrackOptions = useMemo<CreateLocalTracksOptions>(
    () => ({
      // The only reason we request audio here is to get the audio permission
      // request over with at the same time. But changing the audio settings
      // shouldn't cause this hook to recreate the track, which is why we
      // reference the initial values here.
      // We also pass in a clone because livekit mutates the object passed in,
      // which would cause the devices to be re-opened on the next render.
      audio: Object.assign({}, initialAudioOptions),
      video: muteStates.video.enabled && {
        deviceId: devices.videoInput.selectedId,
        processor: initialProcessor,
      },
    }),
    [
      initialAudioOptions,
      muteStates.video.enabled,
      devices.videoInput.selectedId,
      initialProcessor,
    ],
  );

  const onError = useCallback(
    (error: Error) => {
      logger.error("Error while creating preview Tracks:", error);
      muteStates.audio.setEnabled?.(false);
      muteStates.video.setEnabled?.(false);
    },
    [muteStates.audio, muteStates.video],
  );

  const tracks = usePreviewTracks(localTrackOptions, onError);

  const videoTrack = useMemo(() => {
    const track = tracks?.find((t) => t.kind === Track.Kind.Video);
    return track as LocalVideoTrack | null;
  }, [tracks]);
  useTrackProcessorSync(videoTrack);
  const showSwitchCamera = useShowSwitchCamera(
    useObservable(
      (inputs) => inputs.pipe(map(([video]) => video)),
      [videoTrack],
    ),
  );

  // TODO: Unify this component with InCallView, so we can get slick joining
  // animations and don't have to feel bad about reusing its CSS
  return (
    <>
      <div className={classNames(styles.room, inCallStyles.inRoom)}>
        {!hideHeader && (
          <Header>
            <LeftNav>
              <RoomHeaderInfo
                id={matrixInfo.roomId}
                name={matrixInfo.roomName}
                avatarUrl={matrixInfo.roomAvatar}
                encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
                participantCount={participantCount}
              />
            </LeftNav>
            <RightNav>
              {onShareClick !== null && <InviteButton onClick={onShareClick} />}
            </RightNav>
          </Header>
        )}
        <div className={styles.content}>
          <VideoPreview
            matrixInfo={matrixInfo}
            muteStates={muteStates}
            videoTrack={videoTrack}
          >
            <Button
              className={classNames(styles.join, {
                [styles.wait]: waitingForInvite,
              })}
              size={waitingForInvite ? "sm" : "lg"}
              onClick={() => {
                if (!waitingForInvite) onEnter();
              }}
              data-testid="lobby_joinCall"
            >
              {enterLabel ?? t("lobby.join_button")}
            </Button>
          </VideoPreview>
          {!recentsButtonInFooter && recentsButton}
        </div>
        <div className={inCallStyles.footer}>
          {recentsButtonInFooter && recentsButton}
          <div className={inCallStyles.buttons}>
            <MicButton
              muted={!muteStates.audio.enabled}
              onClick={onAudioPress}
              disabled={muteStates.audio.setEnabled === null}
            />
            <VideoButton
              muted={!muteStates.video.enabled}
              onClick={onVideoPress}
              disabled={muteStates.video.setEnabled === null}
            />
            {showSwitchCamera && (
              <SwitchCameraButton onClick={showSwitchCamera} />
            )}
            <SettingsButton onClick={openSettings} />
            {!confineToRoom && <EndCallButton onClick={onLeaveClick} />}
          </div>
        </div>
      </div>
      {client && (
        <SettingsModal
          client={client}
          open={settingsModalOpen}
          onDismiss={closeSettings}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      )}
    </>
  );
};
