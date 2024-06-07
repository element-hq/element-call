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
  PropsWithoutRef,
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
import { BehaviorSubject, map } from "rxjs";
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
  Layout,
  TileDescriptor,
  useCallViewModel,
} from "../state/CallViewModel";
import { Grid, TileProps } from "../grid/Grid";
import { MediaViewModel } from "../state/MediaViewModel";
import { useObservable } from "../state/useObservable";
import { useInitial } from "../useInitial";
import { SpotlightTile } from "../tile/SpotlightTile";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { makeGridLayout } from "../grid/GridLayout";
import { makeSpotlightLayout } from "../grid/SpotlightLayout";
import {
  CallLayout,
  GridTileModel,
  TileModel,
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../grid/CallLayout";
import { makeOneOnOneLayout } from "../grid/OneOnOneLayout";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});

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

  const spotlightAlignment = useInitial(
    () => new BehaviorSubject(defaultSpotlightAlignment),
  );
  const pipAlignment = useInitial(
    () => new BehaviorSubject(defaultPipAlignment),
  );

  const layoutSystem = useObservableEagerState(
    useInitial(() =>
      vm.layout.pipe(
        map((l) => {
          let makeLayout: CallLayout<Layout>;
          if (l.type === "grid")
            makeLayout = makeGridLayout as CallLayout<Layout>;
          else if (l.type === "spotlight")
            makeLayout = makeSpotlightLayout as CallLayout<Layout>;
          else if (l.type === "one-on-one")
            makeLayout = makeOneOnOneLayout as CallLayout<Layout>;
          else return null; // Not yet implemented

          return makeLayout({
            minBounds: gridBoundsObservable,
            spotlightAlignment,
            pipAlignment,
          });
        }),
      ),
    ),
  );

  const setGridMode = useCallback(
    (mode: GridMode) => {
      setLegacyLayout(mode);
      vm.setGridMode(mode);
    },
    [setLegacyLayout, vm],
  );

  const showSpotlightIndicators = useObservable(layout.type === "spotlight");
  const showSpeakingIndicators = useObservable(
    layout.type === "spotlight" ||
      (layout.type === "grid" && layout.grid.length > 2),
  );

  const Tile = useMemo(
    () =>
      forwardRef<
        HTMLDivElement,
        PropsWithoutRef<TileProps<TileModel, HTMLDivElement>>
      >(function Tile(
        { className, style, targetWidth, targetHeight, model },
        ref,
      ) {
        const showSpeakingIndicatorsValue = useObservableEagerState(
          showSpeakingIndicators,
        );
        const showSpotlightIndicatorsValue = useObservableEagerState(
          showSpotlightIndicators,
        );

        return model.type === "grid" ? (
          <GridTile
            ref={ref}
            vm={model.vm}
            maximised={false}
            fullscreen={false}
            onToggleFullscreen={toggleFullscreen}
            onOpenProfile={openProfile}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            className={classNames(className, styles.tile)}
            style={style}
            showSpeakingIndicators={showSpeakingIndicatorsValue}
          />
        ) : (
          <SpotlightTile
            ref={ref}
            vms={model.vms}
            maximised={model.maximised}
            fullscreen={false}
            onToggleFullscreen={toggleSpotlightFullscreen}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showIndicators={showSpotlightIndicatorsValue}
            className={classNames(className, styles.tile)}
            style={style}
          />
        );
      }),
    [
      toggleFullscreen,
      toggleSpotlightFullscreen,
      openProfile,
      showSpeakingIndicators,
      showSpotlightIndicators,
    ],
  );

  const LegacyTile = useMemo(
    () =>
      forwardRef<
        HTMLDivElement,
        PropsWithoutRef<TileProps<MediaViewModel, HTMLDivElement>>
      >(function LegacyTile({ model: legacyModel, ...props }, ref) {
        const model: GridTileModel = useMemo(
          () => ({ type: "grid", vm: legacyModel }),
          [legacyModel],
        );
        return <Tile ref={ref} model={model} {...props} />;
      }),
    [Tile],
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
            className={classNames(styles.tile, styles.maximised)}
            vms={layout.spotlight!}
            maximised
            fullscreen={fullscreen}
            onToggleFullscreen={toggleSpotlightFullscreen}
            targetWidth={gridBounds.height}
            targetHeight={gridBounds.width}
            showIndicators={false}
          />
        );
      }
      return (
        <GridTile
          className={classNames(styles.tile, styles.maximised)}
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

    if (layoutSystem === null) {
      // This new layout doesn't yet have an implemented layout system, so fall
      // back to the legacy grid system
      return (
        <LegacyGrid
          items={items}
          layout={legacyLayout}
          disableAnimations={prefersReducedMotion}
          Tile={LegacyTile}
        />
      );
    } else {
      return (
        <>
          <Grid
            className={styles.scrollingGrid}
            model={layout}
            Layout={layoutSystem.scrolling}
            Tile={Tile}
          />
          <Grid
            className={styles.fixedGrid}
            style={{
              insetBlockStart: headerBounds.bottom,
              height: gridBounds.height,
            }}
            model={layout}
            Layout={layoutSystem.fixed}
            Tile={Tile}
          />
        </>
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
