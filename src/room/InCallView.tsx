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
  useTracks,
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import { ConnectionState, Room, Track } from "livekit-client";
import { MatrixClient } from "matrix-js-sdk/src/client";
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
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import classNames from "classnames";
import { useStateObservable } from "@react-rxjs/core";

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
import { useVideoGridLayout, VideoGrid } from "../video-grid/VideoGrid";
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { VideoTile } from "../video-grid/VideoTile";
import { NewVideoGrid } from "../video-grid/NewVideoGrid";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useLiveKit } from "../livekit/useLiveKit";
import { useFullscreen } from "./useFullscreen";
import { useLayoutStates } from "../video-grid/Layout";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { MuteStates } from "./MuteStates";
import { MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import { ECConnectionState } from "../livekit/useECConnectionState";
import { useOpenIDSFU } from "../livekit/openIDSFU";
import { useCallViewModel } from "../state/CallViewModel";
import { subscribe } from "../state/subscribe";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export interface ActiveCallProps
  extends Omit<InCallViewProps, "livekitRoom" | "connState"> {
  e2eeSystem: EncryptionSystem;
}

export const ActiveCall: FC<ActiveCallProps> = (props) => {
  const sfuConfig = useOpenIDSFU(props.client, props.rtcSession);
  const { livekitRoom, connState } = useLiveKit(
    props.rtcSession,
    props.muteStates,
    sfuConfig,
    props.e2eeSystem,
  );

  useEffect(() => {
    return (): void => {
      livekitRoom?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!livekitRoom) return null;

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

export const InCallView: FC<InCallViewProps> = subscribe(
  ({
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
        const onSpotlightLayout = (
          ev: CustomEvent<IWidgetApiRequest>,
        ): void => {
          setLayout("spotlight");
          widget!.api.transport.reply(ev.detail, {});
        };

        widget.lazyActions.on(ElementWidgetActions.TileLayout, onTileLayout);
        widget.lazyActions.on(
          ElementWidgetActions.SpotlightLayout,
          onSpotlightLayout,
        );

        return (): void => {
          widget!.lazyActions.off(
            ElementWidgetActions.TileLayout,
            onTileLayout,
          );
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

    const vm = useCallViewModel(
      rtcSession.room,
      livekitRoom,
      matrixInfo.e2eeSystem.kind !== E2eeType.NONE,
      connState,
    );
    const items = useStateObservable(vm.tiles);
    const { fullscreenItem, toggleFullscreen, exitFullscreen } =
      useFullscreen(items);

    // The maximised participant: either the participant that the user has
    // manually put in fullscreen, or the focused (active) participant if the
    // window is too small to show everyone
    const maximisedParticipant = useMemo(
      () =>
        fullscreenItem ??
        (noControls
          ? (items.find((item) => item.isSpeaker) ?? items.at(0) ?? null)
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
            vm={maximisedParticipant.data}
            maximised={true}
            fullscreen={maximisedParticipant === fullscreenItem}
            onToggleFullscreen={toggleFullscreen}
            targetHeight={bounds.height}
            targetWidth={bounds.width}
            key={maximisedParticipant.id}
            showSpeakingIndicator={false}
            onOpenProfile={openProfile}
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
          {({ data: vm, ...props }): ReactNode => (
            <VideoTile
              vm={vm}
              maximised={false}
              fullscreen={false}
              onToggleFullscreen={toggleFullscreen}
              showSpeakingIndicator={items.length > 2}
              onOpenProfile={openProfile}
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
    const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

    const openSettings = useCallback(
      () => setSettingsModalOpen(true),
      [setSettingsModalOpen],
    );
    const closeSettings = useCallback(
      () => setSettingsModalOpen(false),
      [setSettingsModalOpen],
    );

    const openProfile = useCallback(() => {
      setSettingsTab("profile");
      setSettingsModalOpen(true);
    }, [setSettingsTab, setSettingsModalOpen]);

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
          onPress={function (): void {
            onLeave();
          }}
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
                encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
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
        {!noControls && (
          <RageshakeRequestModal {...rageshakeRequestModalProps} />
        )}
        <SettingsModal
          client={client}
          roomId={rtcSession.room.roomId}
          open={settingsModalOpen}
          onDismiss={closeSettings}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      </div>
    );
  },
);
