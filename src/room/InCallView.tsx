/*
Copyright 2022 - 2024 New Vector Ltd

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
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import classNames from "classnames";
import { BehaviorSubject } from "rxjs";
import { useObservableEagerState } from "observable-hooks";
import { useTranslation } from "react-i18next";

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
import { LegacyGrid, useLegacyGridLayout } from "../grid/LegacyGrid";
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useLiveKit } from "../livekit/useLiveKit";
import { useFullscreen } from "./useFullscreen";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { MuteStates } from "./MuteStates";
import { MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import { ECConnectionState } from "../livekit/useECConnectionState";
import { useOpenIDSFU } from "../livekit/openIDSFU";
import {
  GridMode,
  TileDescriptor,
  useCallViewModel,
} from "../state/CallViewModel";
import { Grid, TileProps } from "../grid/Grid";
import { MediaViewModel } from "../state/MediaViewModel";
import { gridLayoutSystems } from "../grid/GridLayout";
import { useObservable } from "../state/useObservable";
import { useInitial } from "../useInitial";
import { SpotlightTile } from "../tile/SpotlightTile";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});

export interface Alignment {
  inline: "start" | "end";
  block: "start" | "end";
}

const defaultAlignment: Alignment = { inline: "end", block: "end" };

const dummySpotlightItem = {
  id: "spotlight",
} as TileDescriptor<MediaViewModel>;

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
  const [containerRef2, bounds] = useMeasure();
  const boundsValid = bounds.height > 0;
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

  const screenSharingTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    {
      room: livekitRoom,
    },
  );
  const { layout: legacyLayout, setLayout: setLegacyLayout } =
    useLegacyGridLayout(screenSharingTracks.length > 0);

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
      legacyLayout === "grid"
        ? ElementWidgetActions.TileLayout
        : ElementWidgetActions.SpotlightLayout,
      {},
    );
  }, [legacyLayout]);

  useEffect(() => {
    if (widget) {
      const onTileLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setLegacyLayout("grid");
        widget!.api.transport.reply(ev.detail, {});
      };
      const onSpotlightLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setLegacyLayout("spotlight");
        widget!.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(ElementWidgetActions.TileLayout, onTileLayout);
      widget.lazyActions.on(
        ElementWidgetActions.SpotlightLayout,
        onSpotlightLayout,
      );

      return (): void => {
        widget!.lazyActions.off(ElementWidgetActions.TileLayout, onTileLayout);
        widget!.lazyActions.off(
          ElementWidgetActions.SpotlightLayout,
          onSpotlightLayout,
        );
      };
    }
  }, [setLegacyLayout]);

  const mobile = boundsValid && bounds.width <= 660;
  const reducedControls = boundsValid && bounds.width <= 340;
  const noControls = reducedControls && bounds.height <= 400;

  const vm = useCallViewModel(
    rtcSession.room,
    livekitRoom,
    matrixInfo.e2eeSystem.kind !== E2eeType.NONE,
    connState,
  );
  const items = useObservableEagerState(vm.tiles);
  const layout = useObservableEagerState(vm.layout);
  const hasSpotlight = layout.spotlight !== undefined;
  // Hack: We insert a dummy "spotlight" tile into the tiles we pass to
  // useFullscreen so that we can control the fullscreen state of the
  // spotlight tile in the new layouts with this same hook.
  const fullscreenItems = useMemo(
    () => (hasSpotlight ? [...items, dummySpotlightItem] : items),
    [items, hasSpotlight],
  );
  const { fullscreenItem, toggleFullscreen, exitFullscreen } =
    useFullscreen(fullscreenItems);
  const toggleSpotlightFullscreen = useCallback(
    () => toggleFullscreen("spotlight"),
    [toggleFullscreen],
  );

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

  const prefersReducedMotion = usePrefersReducedMotion();

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

  const [headerRef, headerBounds] = useMeasure();
  const [footerRef, footerBounds] = useMeasure();
  const gridBounds = useMemo(
    () => ({
      width: footerBounds.width,
      height: bounds.height - headerBounds.height - footerBounds.height,
    }),
    [
      footerBounds.width,
      bounds.height,
      headerBounds.height,
      footerBounds.height,
    ],
  );
  const gridBoundsObservable = useObservable(gridBounds);
  const floatingAlignment = useInitial(
    () => new BehaviorSubject(defaultAlignment),
  );
  const { fixed, scrolling } = useInitial(() =>
    gridLayoutSystems(gridBoundsObservable, floatingAlignment),
  );

  const setGridMode = useCallback(
    (mode: GridMode) => {
      setLegacyLayout(mode);
      vm.setGridMode(mode);
    },
    [setLegacyLayout, vm],
  );

  const showSpeakingIndicators =
    layout.type === "spotlight" ||
    (layout.type === "grid" && layout.grid.length > 2);

  const SpotlightTileView = useMemo(
    () =>
      forwardRef<HTMLDivElement, TileProps<MediaViewModel[], HTMLDivElement>>(
        function SpotlightTileView(
          { className, style, targetWidth, targetHeight, model },
          ref,
        ) {
          return (
            <SpotlightTile
              ref={ref}
              vms={model}
              maximised={false}
              fullscreen={false}
              onToggleFullscreen={toggleSpotlightFullscreen}
              targetWidth={targetWidth}
              targetHeight={targetHeight}
              className={className}
              style={style}
            />
          );
        },
      ),
    [toggleSpotlightFullscreen],
  );
  const GridTileView = useMemo(
    () =>
      forwardRef<HTMLDivElement, TileProps<MediaViewModel, HTMLDivElement>>(
        function GridTileView(
          { className, style, targetWidth, targetHeight, model },
          ref,
        ) {
          return (
            <GridTile
              ref={ref}
              vm={model}
              maximised={false}
              fullscreen={false}
              onToggleFullscreen={toggleFullscreen}
              onOpenProfile={openProfile}
              targetWidth={targetWidth}
              targetHeight={targetHeight}
              className={className}
              style={style}
              showSpeakingIndicators={showSpeakingIndicators}
            />
          );
        },
      ),
    [toggleFullscreen, openProfile, showSpeakingIndicators],
  );

  const renderContent = (): JSX.Element => {
    if (items.length === 0) {
      return (
        <div className={styles.centerMessage}>
          <p>{t("waiting_for_participants")}</p>
        </div>
      );
    }

    if (maximisedParticipant !== null) {
      const fullscreen = maximisedParticipant === fullscreenItem;
      if (maximisedParticipant.id === "spotlight") {
        return (
          <SpotlightTile
            vms={layout.spotlight!}
            maximised={true}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleSpotlightFullscreen}
            targetWidth={gridBounds.height}
            targetHeight={gridBounds.width}
          />
        );
      }
      return (
        <GridTile
          vm={maximisedParticipant.data}
          maximised={true}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          targetHeight={gridBounds.height}
          targetWidth={gridBounds.width}
          key={maximisedParticipant.id}
          showSpeakingIndicators={false}
          onOpenProfile={openProfile}
        />
      );
    }

    // The only new layout we've implemented so far is grid layout for non-1:1
    // calls. All other layouts use the legacy grid system for now.
    if (
      legacyLayout === "grid" &&
      layout.type === "grid" &&
      !(layout.grid.length === 2 && layout.spotlight === undefined)
    ) {
      return (
        <>
          <Grid
            className={styles.scrollingGrid}
            model={layout}
            system={scrolling}
            Tile={GridTileView}
          />
          <Grid
            className={styles.fixedGrid}
            style={{ insetBlockStart: headerBounds.bottom }}
            model={layout}
            system={fixed}
            Tile={SpotlightTileView}
          />
        </>
      );
    } else {
      return (
        <LegacyGrid
          items={items}
          layout={legacyLayout}
          disableAnimations={prefersReducedMotion}
          Tile={GridTileView}
        />
      );
    }
  };

  const rageshakeRequestModalProps = useRageshakeRequestModal(
    rtcSession.room.roomId,
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
        onPress={function (): void {
          onLeave();
        }}
        data-testid="incall_leave"
      />,
    );
    footer = (
      <div
        ref={footerRef}
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
            layout={legacyLayout}
            setLayout={setGridMode}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.inRoom} ref={containerRef}>
      {!hideHeader && maximisedParticipant === null && (
        <Header className={styles.header} ref={headerRef}>
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
      <RoomAudioRenderer />
      {renderContent()}
      {footer}
      {!noControls && <RageshakeRequestModal {...rageshakeRequestModalProps} />}
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
};
