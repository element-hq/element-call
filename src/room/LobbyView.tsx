/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { type MatrixClient } from "matrix-js-sdk";
import { Button, Heading, InlineSpinner, Text } from "@vector-im/compound-web";
import classNames from "classnames";
import {
  CheckIcon,
  SpinnerIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { logger } from "matrix-js-sdk/lib/logger";
import { usePreviewTracks } from "@livekit/components-react";
import {
  type CreateLocalTracksOptions,
  type LocalVideoTrack,
  Track,
} from "livekit-client";
import { useObservableEagerState } from "observable-hooks";

import inCallStyles from "./InCallView.module.css";
import styles from "./LobbyView.module.css";
import buttonStyles from "../button/Button.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { type MatrixInfo, VideoPreview } from "./VideoPreview";
import { type MuteStates } from "../state/MuteStates";
import { InviteButton } from "../button/InviteButton";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRootSizeMatches } from "../useRootSize";
import { E2eeType } from "../e2ee/e2eeType";
import { LeaveToHomeLink } from "../button/LeaveToHomeLink";
import { useLeaveToHome } from "../LeaveToHomeContext";
import { useMediaDevices } from "../MediaDevicesContext";
import { ObservableScope } from "../state/ObservableScope";
import { useInitial } from "../useInitial";
import {
  useTrackProcessor,
  useTrackProcessorSync,
} from "../livekit/TrackProcessorContext";
import { getValue } from "../utils/observable";
import { useBehavior } from "../useBehavior";
import { CallFooter, type FooterSnapshot } from "../components/CallFooter";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { createLobbyFooterViewModel } from "../components/CallFooterViewModel";
import { type ViewModel } from "../state/ViewModel";
import { useAppBarPrimaryButtonIconKind } from "../AppBar";
import { type LobbyJoinState } from "./LobbyJoinState";

interface Props {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  joinState: LobbyJoinState;
  confineToRoom: boolean;
  hideHeader: boolean;
  participantCount: number | null;
  onShareClick: (() => void) | null;
}

export const LobbyView: FC<Props> = ({
  client,
  matrixInfo,
  muteStates,
  joinState,
  confineToRoom,
  hideHeader,
  participantCount,
  onShareClick,
}) => {
  useEffect(() => {
    logger.info("[Lifecycle] LobbyView Component mounted");
    return (): void => {
      logger.info("[Lifecycle] LobbyView Component unmounted");
    };
  }, []);

  const { t } = useTranslation();

  useAppBarPrimaryButtonIconKind("back");
  const audioEnabled = useBehavior(muteStates.audio.enabled$);
  const videoEnabled = useBehavior(muteStates.video.enabled$);
  const toggleAudio = useBehavior(muteStates.audio.toggle$);
  const toggleVideo = useBehavior(muteStates.video.toggle$);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  // This function incorrectly assumes that there is a camera and microphone, which is not always the case.
  // TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
  // Next to the keyboard shortcuts, this is also responsible for catching escape key presses and forwarding the to mobile -> pip.
  useCallViewKeyboardShortcuts(toggleAudio, toggleVideo, null, null, null);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  // Leaving the lobby means going back to wherever the user came from, if
  // there is such a place
  const leaveToHome = useLeaveToHome();
  const hangup =
    confineToRoom || leaveToHome === null ? undefined : leaveToHome;

  const recentsButtonInFooter = useRootSizeMatches(
    ({ height }) => height <= 500,
  );
  const recentsButton = !confineToRoom && (
    <LeaveToHomeLink className={styles.recents}>
      {t("lobby.leave_button")}
    </LeaveToHomeLink>
  );

  const devices = useMediaDevices();
  const videoInputId = useObservableEagerState(
    devices.videoInput.selected$,
  )?.id;

  // Capture the audio options as they were when we first mounted, because
  // we're not doing anything with the audio anyway so we don't need to
  // re-open the devices when they change (see below).
  const initialAudioOptions = useInitial(
    () =>
      audioEnabled && {
        deviceId: getValue(devices.audioInput.selected$)?.id,
      },
  );

  const { processor } = useTrackProcessor();

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
      video: videoEnabled && {
        deviceId: videoInputId,
        processor: initialProcessor,
      },
    }),
    [initialAudioOptions, videoEnabled, videoInputId, initialProcessor],
  );

  const onError = useCallback(
    (error: Error) => {
      logger.error("Error while creating preview Tracks:", error);
      muteStates.audio.setEnabled$.value?.(false);
      muteStates.video.setEnabled$.value?.(false);
    },
    [muteStates],
  );

  const tracks = usePreviewTracks(localTrackOptions, onError);

  const videoTrack = useMemo(
    () =>
      (tracks?.find((t) => t.kind === Track.Kind.Video) ??
        null) as LocalVideoTrack | null,
    [tracks],
  );

  useEffect(() => {
    if (videoTrack && videoInputId === undefined) {
      // If we have a video track but no videoInputId,
      // we have to update the available devices. So that we select the first
      // available video input device as the default instead of the `""` id.
      devices.requestDeviceNames();
    }
  }, [devices, videoInputId, videoTrack]);

  useTrackProcessorSync(videoTrack);

  const [footerVm, setFooterVm] = useState<ViewModel<FooterSnapshot> | null>(
    null,
  );
  useEffect(() => {
    const footerScope = new ObservableScope();
    setFooterVm(
      createLobbyFooterViewModel(
        footerScope,
        muteStates,
        devices,
        openSettings,
        hangup,
        // Logo and header are connected: only show the logo in SPA with header.
        !hideHeader,
      ),
    );
    return (): void => {
      footerScope.end();
    };
  }, [devices, hangup, hideHeader, muteStates, openSettings]);

  const joinButton = ((): ReactNode => {
    switch (joinState.kind) {
      case "can-join":
        return (
          <Button
            className={styles.join}
            size="lg"
            onClick={joinState.join}
            data-testid="lobby_joinCall"
          >
            {t("lobby.join_button")}
          </Button>
        );
      case "can-ask-to-join":
        return (
          <Button
            className={styles.join}
            size="lg"
            onClick={() => joinState.askToJoin()}
            data-testid="lobby_joinCall"
          >
            {t("lobby.ask_to_join")}
          </Button>
        );
      case "sending-request":
      case "joining":
        return (
          <Button
            className={classNames(styles.join, buttonStyles.rotate)}
            size="lg"
            Icon={SpinnerIcon}
            disabled
            aria-busy
            data-testid="lobby_joinCall"
          >
            {t(
              joinState.kind === "joining"
                ? "lobby.joining"
                : "lobby.ask_to_join",
            )}
          </Button>
        );
      case "waiting-for-approval":
        return (
          <Button
            className={classNames(styles.join, styles.wait)}
            size="md"
            disabled
            data-testid="lobby_joinCall"
          >
            {t("lobby.request_sent")}
            <CheckIcon />
          </Button>
        );
      case "denied":
      case "banned":
      case "not-allowed":
        return null;
    }
  })();

  const joinMessage = ((): ReactNode => {
    switch (joinState.kind) {
      case "can-join":
        return joinState.notice === undefined ? null : (
          <Text size="sm">{t("lobby.request_accepted")}</Text>
        );
      case "can-ask-to-join":
        return joinState.error === undefined ? null : (
          <Text size="sm">{t("error.generic")}</Text>
        );
      case "waiting-for-approval":
        return (
          <>
            <div className={styles.waiting}>
              <InlineSpinner aria-label={t("common.loading")} />
              <Text size="sm">{t("lobby.request_sent_body")}</Text>
            </div>
            {joinState.cancelRequest !== undefined && (
              <Button
                kind="tertiary"
                size="md"
                onClick={joinState.cancelRequest}
                data-testid="lobby_cancelRequest"
              >
                {t("lobby.cancel_request")}
              </Button>
            )}
          </>
        );
      case "denied":
        return (
          <>
            <Heading as="h2" weight="semibold" size="sm">
              {t("group_call_loader.knock_reject_heading")}
            </Heading>
            <Text size="sm">{t("group_call_loader.knock_reject_body")}</Text>
          </>
        );
      case "banned":
        return (
          <>
            <Heading as="h2" weight="semibold" size="sm">
              {t("group_call_loader.banned_heading")}
            </Heading>
            <Text size="sm">{t("group_call_loader.banned_body")}</Text>
            {joinState.reason !== undefined && (
              <Text size="sm">
                {t("group_call_loader.reason", { reason: joinState.reason })}
              </Text>
            )}
          </>
        );
      case "not-allowed":
        return <Text size="sm">{t("lobby.invite_only_body")}</Text>;
      case "sending-request":
      case "joining":
        return null;
    }
  })();

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
            videoEnabled={videoEnabled}
            videoTrack={videoTrack}
          >
            {joinButton}
          </VideoPreview>
          {joinMessage !== null && (
            <div className={styles.joinMessage} data-testid="lobby_joinMessage">
              {joinMessage}
            </div>
          )}
          {!recentsButtonInFooter && recentsButton}
        </div>
        {footerVm !== null && (
          <CallFooter vm={footerVm}>
            {recentsButtonInFooter && recentsButton}
          </CallFooter>
        )}
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
