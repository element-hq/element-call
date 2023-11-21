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

import { ResizeObserver } from "@juggle/resize-observer";
import {
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import { ConnectionState, Room, Track } from "livekit-client";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { Room as MatrixRoom } from "matrix-js-sdk/src/models/room";
import {
  FC,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-measure";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import classNames from "classnames";

import LogoMark from "../icons/LogoMark.svg?react";
import LogoType from "../icons/LogoType.svg?react";
import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
  SettingsButton,
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import {
  useVideoGridLayout,
  TileDescriptor,
  VideoGrid,
} from "../video-grid/VideoGrid";
import { useShowConnectionStats } from "../settings/useSetting";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { ItemData, TileContent, VideoTile } from "../video-grid/VideoTile";
import { NewVideoGrid } from "../video-grid/NewVideoGrid";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { E2EEConfig, useLiveKit } from "../livekit/useLiveKit";
import { useFullscreen } from "./useFullscreen";
import { useLayoutStates } from "../video-grid/Layout";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { MuteStates } from "./MuteStates";
import { MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import {
  ECAddonConnectionState,
  ECConnectionState,
} from "../livekit/useECConnectionState";
import { useOpenIDSFU } from "../livekit/openIDSFU";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// How long we wait after a focus switch before showing the real participant list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

export interface ActiveCallProps
  extends Omit<InCallViewProps, "livekitRoom" | "connState"> {
  e2eeConfig: E2EEConfig;
}

export const ActiveCall: FC<ActiveCallProps> = (props) => {
  const sfuConfig = useOpenIDSFU(props.client, props.rtcSession);
  const { livekitRoom, connState } = useLiveKit(
    props.rtcSession,
    props.muteStates,
    sfuConfig,
    props.e2eeConfig,
  );

  if (!livekitRoom) {
    return null;
  }

  return (
    <RoomContext.Provider value={livekitRoom}>
      <InCallView {...props} livekitRoom={livekitRoom} connState={connState} />
    </RoomContext.Provider>
  );
};

export interface InCallViewProps {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  rtcSession: MatrixRTCSession;
  livekitRoom: Room;
  muteStates: MuteStates;
  participantCount: number;
  onLeave: (error?: Error) => void;
  hideHeader: boolean;
  otelGroupCallMembership?: OTelGroupCallMembership;
  connState: ECConnectionState;
  onShareClick: (() => void) | null;
}

export const InCallView: FC<InCallViewProps> = ({
  client,
  matrixInfo,
  rtcSession,
  livekitRoom,
  muteStates,
  participantCount,
  onLeave,
  hideHeader,
  otelGroupCallMembership,
  connState,
  onShareClick,
}) => {
  const { t } = useTranslation();
  usePreventScroll();
  useWakeLock();

  useEffect(() => {
    if (connState === ConnectionState.Disconnected) {
      // annoyingly we don't get the disconnection reason this way,
      // only by listening for the emitted event
      onLeave(new Error("Disconnected from call server"));
    }
  }, [connState, onLeave]);

  const containerRef1 = useRef<HTMLDivElement | null>(null);
  const [containerRef2, bounds] = useMeasure({ polyfill: ResizeObserver });
  const boundsValid = bounds.height > 0;
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

  const screenSharingTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    {
      room: livekitRoom,
    },
  );
  const { layout, setLayout } = useVideoGridLayout(
    screenSharingTracks.length > 0,
  );

  const [showConnectionStats] = useShowConnectionStats();

  const { hideScreensharing, showControls } = useUrlParams();

  const { isScreenShareEnabled, localParticipant } = useLocalParticipant({
    room: livekitRoom,
  });

  const toggleMicrophone = useCallback(
    () => muteStates.audio.setEnabled?.((e) => !e),
    [muteStates],
  );
  const toggleCamera = useCallback(
    () => muteStates.video.setEnabled?.((e) => !e),
    [muteStates],
  );

  // This function incorrectly assumes that there is a camera and microphone, which is not always the case.
  // TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
  useCallViewKeyboardShortcuts(
    containerRef1,
    toggleMicrophone,
    toggleCamera,
    (muted) => muteStates.audio.setEnabled?.(!muted),
  );

  const onLeavePress = useCallback(() => {
    // Disconnect from the room. We don't do this in onLeave because that's
    // also called on an unintentional disconnect. Plus we don't have the
    // livekit room in onLeave anyway.
    livekitRoom.disconnect();
    onLeave();
  }, [livekitRoom, onLeave]);

  useEffect(() => {
    widget?.api.transport.send(
      layout === "grid"
        ? ElementWidgetActions.TileLayout
        : ElementWidgetActions.SpotlightLayout,
      {},
    );
  }, [layout]);

  useEffect(() => {
    if (widget) {
      const onTileLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setLayout("grid");
        widget!.api.transport.reply(ev.detail, {});
      };
      const onSpotlightLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setLayout("spotlight");
        widget!.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(ElementWidgetActions.TileLayout, onTileLayout);
      widget.lazyActions.on(
        ElementWidgetActions.SpotlightLayout,
        onSpotlightLayout,
      );

      return () => {
        widget!.lazyActions.off(ElementWidgetActions.TileLayout, onTileLayout);
        widget!.lazyActions.off(
          ElementWidgetActions.SpotlightLayout,
          onSpotlightLayout,
        );
      };
    }
  }, [setLayout]);

  const mobile = boundsValid && bounds.width <= 660;
  const reducedControls = boundsValid && bounds.width <= 340;
  const noControls = reducedControls && bounds.height <= 400;

  const items = useParticipantTiles(livekitRoom, rtcSession.room, connState);
  const { fullscreenItem, toggleFullscreen, exitFullscreen } =
    useFullscreen(items);

  // The maximised participant: either the participant that the user has
  // manually put in fullscreen, or the focused (active) participant if the
  // window is too small to show everyone
  const maximisedParticipant = useMemo(
    () =>
      fullscreenItem ??
      (noControls
        ? items.find((item) => item.isSpeaker) ?? items.at(0) ?? null
        : null),
    [fullscreenItem, noControls, items],
  );

  const Grid =
    items.length > 12 && layout === "grid" ? NewVideoGrid : VideoGrid;

  const prefersReducedMotion = usePrefersReducedMotion();

  // This state is lifted out of NewVideoGrid so that layout states can be
  // restored after a layout switch or upon exiting fullscreen
  const layoutStates = useLayoutStates();

  const renderContent = (): JSX.Element => {
    if (items.length === 0) {
      return (
        <div className={styles.centerMessage}>
          <p>{t("waiting_for_participants")}</p>
        </div>
      );
    }
    if (maximisedParticipant) {
      return (
        <VideoTile
          maximised={true}
          fullscreen={maximisedParticipant === fullscreenItem}
          onToggleFullscreen={toggleFullscreen}
          targetHeight={bounds.height}
          targetWidth={bounds.width}
          key={maximisedParticipant.id}
          data={maximisedParticipant.data}
          showSpeakingIndicator={false}
          showConnectionStats={showConnectionStats}
          matrixInfo={matrixInfo}
        />
      );
    }

    return (
      <Grid
        items={items}
        layout={layout}
        disableAnimations={prefersReducedMotion || isSafari}
        layoutStates={layoutStates}
      >
        {(props): ReactNode => (
          <VideoTile
            maximised={false}
            fullscreen={false}
            onToggleFullscreen={toggleFullscreen}
            showSpeakingIndicator={items.length > 2}
            showConnectionStats={showConnectionStats}
            matrixInfo={matrixInfo}
            {...props}
            ref={props.ref as Ref<HTMLDivElement>}
          />
        )}
      </Grid>
    );
  };

  const rageshakeRequestModalProps = useRageshakeRequestModal(
    rtcSession.room.roomId,
  );

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const toggleScreensharing = useCallback(async () => {
    exitFullscreen();
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
      audio: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
      systemAudio: "include",
    });
  }, [localParticipant, isScreenShareEnabled, exitFullscreen]);

  let footer: JSX.Element | null;

  if (noControls) {
    footer = null;
  } else {
    const buttons: JSX.Element[] = [];

    buttons.push(
      <MicButton
        key="1"
        muted={!muteStates.audio.enabled}
        onPress={toggleMicrophone}
        disabled={muteStates.audio.setEnabled === null}
        data-testid="incall_mute"
      />,
      <VideoButton
        key="2"
        muted={!muteStates.video.enabled}
        onPress={toggleCamera}
        disabled={muteStates.video.setEnabled === null}
        data-testid="incall_videomute"
      />,
    );

    if (!reducedControls) {
      if (canScreenshare && !hideScreensharing) {
        buttons.push(
          <ScreenshareButton
            key="3"
            enabled={isScreenShareEnabled}
            onPress={toggleScreensharing}
            data-testid="incall_screenshare"
          />,
        );
      }
      buttons.push(<SettingsButton key="4" onPress={openSettings} />);
    }

    buttons.push(
      <HangupButton
        key="6"
        onPress={onLeavePress}
        data-testid="incall_leave"
      />,
    );
    footer = (
      <div
        className={classNames(
          showControls
            ? styles.footer
            : hideHeader
            ? [styles.footer, styles.footerHidden]
            : [styles.footer, styles.footerThin],
        )}
      >
        {!mobile && !hideHeader && (
          <div className={styles.logo}>
            <LogoMark width={24} height={24} aria-hidden />
            <LogoType
              width={80}
              height={11}
              aria-label={import.meta.env.VITE_PRODUCT_NAME || "Element Call"}
            />
          </div>
        )}
        {showControls && <div className={styles.buttons}>{buttons}</div>}
        {!mobile && !hideHeader && showControls && (
          <LayoutToggle
            className={styles.layout}
            layout={layout}
            setLayout={setLayout}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.inRoom} ref={containerRef}>
      {!hideHeader && maximisedParticipant === null && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo
              id={matrixInfo.roomId}
              name={matrixInfo.roomName}
              avatarUrl={matrixInfo.roomAvatar}
              encrypted={matrixInfo.roomEncrypted}
              participantCount={participantCount}
            />
          </LeftNav>
          <RightNav>
            {!reducedControls && showControls && onShareClick !== null && (
              <InviteButton onClick={onShareClick} />
            )}
          </RightNav>
        </Header>
      )}
      <div className={styles.controlsOverlay}>
        <RoomAudioRenderer />
        {renderContent()}
        {footer}
      </div>
      {!noControls && <RageshakeRequestModal {...rageshakeRequestModalProps} />}
      <SettingsModal
        client={client}
        roomId={rtcSession.room.roomId}
        open={settingsModalOpen}
        onDismiss={closeSettings}
      />
    </div>
  );
};

function findMatrixMember(
  room: MatrixRoom,
  id: string,
): RoomMember | undefined {
  if (!id) return undefined;

  const parts = id.split(":");
  // must be at least 3 parts because we know the first part is a userId which must necessarily contain a colon
  if (parts.length < 3) {
    logger.warn(
      "Livekit participants ID doesn't look like a userId:deviceId combination",
    );
    return undefined;
  }

  parts.pop();
  const userId = parts.join(":");

  return room.getMember(userId) ?? undefined;
}

function useParticipantTiles(
  livekitRoom: Room,
  matrixRoom: MatrixRoom,
  connState: ECConnectionState,
): TileDescriptor<ItemData>[] {
  const previousTiles = useRef<TileDescriptor<ItemData>[]>([]);

  const sfuParticipants = useParticipants({
    room: livekitRoom,
  });

  const items = useMemo(() => {
    let allGhosts = true;

    const speakActiveTime = new Date();
    speakActiveTime.setSeconds(speakActiveTime.getSeconds() - 10);
    // Iterate over SFU participants (those who actually are present from the SFU perspective) and create tiles for them.
    const tiles: TileDescriptor<ItemData>[] = sfuParticipants.flatMap(
      (sfuParticipant) => {
        const spokeRecently =
          sfuParticipant.lastSpokeAt !== undefined &&
          sfuParticipant.lastSpokeAt > speakActiveTime;

        const id = sfuParticipant.identity;
        const member = findMatrixMember(matrixRoom, id);
        // We always start with a local participant wit the empty string as their ID before we're
        // connected, this is fine and we'll be in "all ghosts" mode.
        if (id !== "" && member === undefined) {
          logger.warn(
            `Ruh, roh! No matrix member found for SFU participant '${id}': creating g-g-g-ghost!`,
          );
        }
        allGhosts &&= member === undefined;

        const userMediaTile = {
          id,
          focused: false,
          isPresenter: sfuParticipant.isScreenShareEnabled,
          isSpeaker:
            (sfuParticipant.isSpeaking || spokeRecently) &&
            !sfuParticipant.isLocal,
          hasVideo: sfuParticipant.isCameraEnabled,
          local: sfuParticipant.isLocal,
          largeBaseSize: false,
          data: {
            id,
            member,
            sfuParticipant,
            content: TileContent.UserMedia,
          },
        };

        // If there is a screen sharing enabled for this participant, create a tile for it as well.
        let screenShareTile: TileDescriptor<ItemData> | undefined;
        if (sfuParticipant.isScreenShareEnabled) {
          const screenShareId = `${id}:screen-share`;
          screenShareTile = {
            ...userMediaTile,
            id: screenShareId,
            focused: true,
            largeBaseSize: true,
            placeNear: id,
            data: {
              ...userMediaTile.data,
              id: screenShareId,
              content: TileContent.ScreenShare,
            },
          };
        }

        return screenShareTile
          ? [userMediaTile, screenShareTile]
          : [userMediaTile];
      },
    );

    PosthogAnalytics.instance.eventCallEnded.cacheParticipantCountChanged(
      tiles.length,
    );

    // If every item is a ghost, that probably means we're still connecting and
    // shouldn't bother showing anything yet
    return allGhosts ? [] : tiles;
  }, [matrixRoom, sfuParticipants]);

  // We carry over old tiles from the previous focus for some time after a focus switch
  // so that the video tiles don't all disappear and reappear.
  // This is set to true when the state transitions to Switching Focus and remains
  // true for a short time after it changes (ie. connState is only switching focus for
  // the time it takes us to reconnect to the conference).
  // If there are still members that haven't reconnected after that time, they'll just
  // appear to disconnect and will reappear once they reconnect.
  const [isSwitchingFocus, setIsSwitchingFocus] = useState(false);

  useEffect(() => {
    if (connState === ECAddonConnectionState.ECSwitchingFocus) {
      setIsSwitchingFocus(true);
    } else if (isSwitchingFocus) {
      setTimeout(() => {
        setIsSwitchingFocus(false);
      }, POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS);
    }
  }, [connState, setIsSwitchingFocus, isSwitchingFocus]);

  if (
    connState === ECAddonConnectionState.ECSwitchingFocus ||
    isSwitchingFocus
  ) {
    logger.debug("Switching focus: injecting previous tiles");

    // inject the previous tile for members that haven't rejoined yet
    const newItems = items.slice(0);
    const rejoined = new Set(newItems.map((p) => p.id));

    for (const prevTile of previousTiles.current) {
      if (!rejoined.has(prevTile.id)) {
        newItems.push(prevTile);
      }
    }

    return newItems;
  } else {
    previousTiles.current = items;
    return items;
  }
}
