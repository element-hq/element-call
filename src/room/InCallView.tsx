/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState, type Room } from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk/src/client";
import {
  type FC,
  type PointerEvent,
  type PropsWithoutRef,
  type TouchEvent,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import useMeasure from "react-use-measure";
import { type MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import classNames from "classnames";
import { BehaviorSubject, map } from "rxjs";
import { useObservable, useObservableEagerState } from "observable-hooks";
import { logger } from "matrix-js-sdk/src/logger";

import LogoMark from "../icons/LogoMark.svg?react";
import LogoType from "../icons/LogoType.svg?react";
import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  EndCallButton,
  MicButton,
  VideoButton,
  ShareScreenButton,
  SettingsButton,
  ReactionToggleButton,
  SwitchCameraButton,
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { type OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useLiveKit } from "../livekit/useLiveKit";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { type MuteStates } from "./MuteStates";
import { type MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import { type ECConnectionState } from "../livekit/useECConnectionState";
import { useOpenIDSFU } from "../livekit/openIDSFU";
import {
  CallViewModel,
  type GridMode,
  type Layout,
} from "../state/CallViewModel";
import { Grid, type TileProps } from "../grid/Grid";
import { useInitial } from "../useInitial";
import { SpotlightTile } from "../tile/SpotlightTile";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { makeGridLayout } from "../grid/GridLayout";
import {
  type CallLayoutOutputs,
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../grid/CallLayout";
import { makeOneOnOneLayout } from "../grid/OneOnOneLayout";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { makeSpotlightLandscapeLayout } from "../grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../grid/SpotlightPortraitLayout";
import { GridTileViewModel, type TileViewModel } from "../state/TileViewModel";
import {
  ReactionsSenderProvider,
  useReactionsSender,
} from "../reactions/useReactionsSender";
import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import { useSwitchCamera } from "./useSwitchCamera";
import { ReactionsOverlay } from "./ReactionsOverlay";
import { CallEventAudioRenderer } from "./CallEventAudioRenderer";
import {
  debugTileLayout as debugTileLayoutSetting,
  useSetting,
} from "../settings/settings";
import { ReactionsReader } from "../reactions/ReactionsReader";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});

const maxTapDurationMs = 400;

export interface ActiveCallProps
  extends Omit<InCallViewProps, "vm" | "livekitRoom" | "connState"> {
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
  const connStateObservable$ = useObservable(
    (inputs$) => inputs$.pipe(map(([connState]) => connState)),
    [connState],
  );
  const [vm, setVm] = useState<CallViewModel | null>(null);

  useEffect(() => {
    return (): void => {
      livekitRoom?.disconnect().catch((e) => {
        logger.error("Failed to disconnect from livekit room", e);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (livekitRoom !== undefined) {
      const reactionsReader = new ReactionsReader(props.rtcSession);
      const vm = new CallViewModel(
        props.rtcSession,
        livekitRoom,
        props.e2eeSystem,
        connStateObservable$,
        reactionsReader.raisedHands$,
        reactionsReader.reactions$,
      );
      setVm(vm);
      return (): void => {
        vm.destroy();
        reactionsReader.destroy();
      };
    }
  }, [props.rtcSession, livekitRoom, props.e2eeSystem, connStateObservable$]);

  if (livekitRoom === undefined || vm === null) return null;

  return (
    <RoomContext.Provider value={livekitRoom}>
      <ReactionsSenderProvider vm={vm} rtcSession={props.rtcSession}>
        <InCallView
          {...props}
          vm={vm}
          livekitRoom={livekitRoom}
          connState={connState}
        />
      </ReactionsSenderProvider>
    </RoomContext.Provider>
  );
};

export interface InCallViewProps {
  client: MatrixClient;
  vm: CallViewModel;
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
  vm,
  matrixInfo,
  rtcSession,
  livekitRoom,
  muteStates,
  participantCount,
  onLeave,
  hideHeader,
  connState,
  onShareClick,
}) => {
  const { supportsReactions, sendReaction, toggleRaisedHand } =
    useReactionsSender();

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
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

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
    (reaction) => void sendReaction(reaction),
    () => void toggleRaisedHand(),
  );

  const windowMode = useObservableEagerState(vm.windowMode$);
  const layout = useObservableEagerState(vm.layout$);
  const tileStoreGeneration = useObservableEagerState(vm.tileStoreGeneration$);
  const [debugTileLayout] = useSetting(debugTileLayoutSetting);
  const gridMode = useObservableEagerState(vm.gridMode$);
  const showHeader = useObservableEagerState(vm.showHeader$);
  const showFooter = useObservableEagerState(vm.showFooter$);
  const switchCamera = useSwitchCamera(vm.localVideo$);

  // Ideally we could detect taps by listening for click events and checking
  // that the pointerType of the event is "touch", but this isn't yet supported
  // in Safari: https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event#browser_compatibility
  // Instead we have to watch for sufficiently fast touch events.
  const touchStart = useRef<number | null>(null);
  const onTouchStart = useCallback(() => (touchStart.current = Date.now()), []);
  const onTouchEnd = useCallback(() => {
    const start = touchStart.current;
    if (start !== null && Date.now() - start <= maxTapDurationMs)
      vm.tapScreen();
    touchStart.current = null;
  }, [vm]);
  const onTouchCancel = useCallback(() => (touchStart.current = null), []);

  // We also need to tell the footer controls to prevent touch events from
  // bubbling up, or else the footer will be dismissed before a click/change
  // event can be registered on the control
  const onControlsTouchEnd = useCallback(
    (e: TouchEvent) => {
      // Somehow applying pointer-events: none to the controls when the footer
      // is hidden is not enough to stop clicks from happening as the footer
      // becomes visible, so we check manually whether the footer is shown
      if (showFooter) {
        e.stopPropagation();
        vm.tapControls();
      } else {
        e.preventDefault();
      }
    },
    [vm, showFooter],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "mouse") vm.hoverScreen();
    },
    [vm],
  );
  const onPointerOut = useCallback(() => vm.unhoverScreen(), [vm]);

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

  const openProfile = useMemo(
    () =>
      // Profile settings are unavailable in widget mode
      widget === null
        ? (): void => {
            setSettingsTab("profile");
            setSettingsModalOpen(true);
          }
        : null,
    [setSettingsTab, setSettingsModalOpen],
  );

  const [headerRef, headerBounds] = useMeasure();
  const [footerRef, footerBounds] = useMeasure();

  const gridBounds = useMemo(
    () => ({
      width: bounds.width,
      height:
        bounds.height -
        headerBounds.height -
        (windowMode === "flat" ? 0 : footerBounds.height),
    }),
    [
      bounds.width,
      bounds.height,
      headerBounds.height,
      footerBounds.height,
      windowMode,
    ],
  );
  const gridBoundsObservable$ = useObservable(
    (inputs$) => inputs$.pipe(map(([gridBounds]) => gridBounds)),
    [gridBounds],
  );

  const spotlightAlignment$ = useInitial(
    () => new BehaviorSubject(defaultSpotlightAlignment),
  );
  const pipAlignment$ = useInitial(
    () => new BehaviorSubject(defaultPipAlignment),
  );

  const setGridMode = useCallback(
    (mode: GridMode) => vm.setGridMode(mode),
    [vm],
  );

  useEffect(() => {
    widget?.api.transport
      .send(
        gridMode === "grid"
          ? ElementWidgetActions.TileLayout
          : ElementWidgetActions.SpotlightLayout,
        {},
      )
      .catch((e) => {
        logger.error("Failed to send layout change to widget API", e);
      });
  }, [gridMode]);

  useEffect(() => {
    if (widget) {
      const onTileLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setGridMode("grid");
        widget!.api.transport.reply(ev.detail, {});
      };
      const onSpotlightLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setGridMode("spotlight");
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
  }, [setGridMode]);

  const Tile = useMemo(
    () =>
      forwardRef<
        HTMLDivElement,
        PropsWithoutRef<TileProps<TileViewModel, HTMLDivElement>>
      >(function Tile(
        { className, style, targetWidth, targetHeight, model },
        ref,
      ) {
        const spotlightExpanded = useObservableEagerState(
          vm.spotlightExpanded$,
        );
        const onToggleExpanded = useObservableEagerState(
          vm.toggleSpotlightExpanded$,
        );
        const showSpeakingIndicatorsValue = useObservableEagerState(
          vm.showSpeakingIndicators$,
        );
        const showSpotlightIndicatorsValue = useObservableEagerState(
          vm.showSpotlightIndicators$,
        );

        return model instanceof GridTileViewModel ? (
          <GridTile
            ref={ref}
            vm={model}
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
            vm={model}
            expanded={spotlightExpanded}
            onToggleExpanded={onToggleExpanded}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showIndicators={showSpotlightIndicatorsValue}
            className={classNames(className, styles.tile)}
            style={style}
          />
        );
      }),
    [vm, openProfile],
  );

  const layouts = useMemo(() => {
    const inputs = {
      minBounds$: gridBoundsObservable$,
      spotlightAlignment$,
      pipAlignment$,
    };
    return {
      grid: makeGridLayout(inputs),
      "spotlight-landscape": makeSpotlightLandscapeLayout(inputs),
      "spotlight-portrait": makeSpotlightPortraitLayout(inputs),
      "spotlight-expanded": makeSpotlightExpandedLayout(inputs),
      "one-on-one": makeOneOnOneLayout(inputs),
    };
  }, [gridBoundsObservable$, spotlightAlignment$, pipAlignment$]);

  const renderContent = (): JSX.Element => {
    if (layout.type === "pip") {
      return (
        <SpotlightTile
          className={classNames(styles.tile, styles.maximised)}
          vm={layout.spotlight}
          expanded
          onToggleExpanded={null}
          targetWidth={gridBounds.height}
          targetHeight={gridBounds.width}
          showIndicators={false}
        />
      );
    }

    const layers = layouts[layout.type] as CallLayoutOutputs<Layout>;
    const fixedGrid = (
      <Grid
        key="fixed"
        className={styles.fixedGrid}
        style={{
          insetBlockStart: headerBounds.bottom,
          height: gridBounds.height,
        }}
        model={layout}
        Layout={layers.fixed}
        Tile={Tile}
      />
    );
    const scrollingGrid = (
      <Grid
        key="scrolling"
        className={styles.scrollingGrid}
        model={layout}
        Layout={layers.scrolling}
        Tile={Tile}
      />
    );
    // The grid tiles go *under* the spotlight in the portrait layout, but
    // *over* the spotlight in the expanded layout
    return layout.type === "spotlight-expanded" ? (
      <>
        {fixedGrid}
        {scrollingGrid}
      </>
    ) : (
      <>
        {scrollingGrid}
        {fixedGrid}
      </>
    );
  };

  const rageshakeRequestModalProps = useRageshakeRequestModal(
    rtcSession.room.roomId,
  );

  const toggleScreensharing = useCallback(() => {
    localParticipant
      .setScreenShareEnabled(!isScreenShareEnabled, {
        audio: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
      })
      .catch(logger.error);
  }, [localParticipant, isScreenShareEnabled]);

  const buttons: JSX.Element[] = [];

  buttons.push(
    <MicButton
      key="audio"
      muted={!muteStates.audio.enabled}
      onClick={toggleMicrophone}
      onTouchEnd={onControlsTouchEnd}
      disabled={muteStates.audio.setEnabled === null}
      data-testid="incall_mute"
    />,
    <VideoButton
      key="video"
      muted={!muteStates.video.enabled}
      onClick={toggleCamera}
      onTouchEnd={onControlsTouchEnd}
      disabled={muteStates.video.setEnabled === null}
      data-testid="incall_videomute"
    />,
  );
  if (switchCamera !== null)
    buttons.push(
      <SwitchCameraButton
        key="switch_camera"
        className={styles.switchCamera}
        onClick={switchCamera}
        onTouchEnd={onControlsTouchEnd}
      />,
    );
  if (canScreenshare && !hideScreensharing) {
    buttons.push(
      <ShareScreenButton
        key="share_screen"
        className={styles.shareScreen}
        enabled={isScreenShareEnabled}
        onClick={toggleScreensharing}
        onTouchEnd={onControlsTouchEnd}
        data-testid="incall_screenshare"
      />,
    );
  }
  if (supportsReactions) {
    buttons.push(
      <ReactionToggleButton
        vm={vm}
        key="raise_hand"
        className={styles.raiseHand}
        identifier={`${client.getUserId()}:${client.getDeviceId()}`}
        onTouchEnd={onControlsTouchEnd}
      />,
    );
  }
  if (layout.type !== "pip")
    buttons.push(
      <SettingsButton
        key="settings"
        onClick={openSettings}
        onTouchEnd={onControlsTouchEnd}
      />,
    );

  buttons.push(
    <EndCallButton
      key="end_call"
      onClick={function (): void {
        onLeave();
      }}
      onTouchEnd={onControlsTouchEnd}
      data-testid="incall_leave"
    />,
  );
  const footer = (
    <div
      ref={footerRef}
      className={classNames(styles.footer, {
        [styles.overlay]: windowMode === "flat",
        [styles.hidden]: !showFooter || (!showControls && hideHeader),
      })}
    >
      {!hideHeader && (
        <div className={styles.logo}>
          <LogoMark width={24} height={24} aria-hidden />
          <LogoType
            width={80}
            height={11}
            aria-label={import.meta.env.VITE_PRODUCT_NAME || "Element Call"}
          />
          {/* Don't mind this odd placement, it's just a little debug label */}
          {debugTileLayout
            ? `Tiles generation: ${tileStoreGeneration}`
            : undefined}
        </div>
      )}
      {showControls && <div className={styles.buttons}>{buttons}</div>}
      {showControls && (
        <LayoutToggle
          className={styles.layout}
          layout={gridMode}
          setLayout={setGridMode}
          onTouchEnd={onControlsTouchEnd}
        />
      )}
    </div>
  );

  return (
    <div
      className={styles.inRoom}
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      {showHeader &&
        (hideHeader ? (
          // Cosmetic header to fill out space while still affecting the bounds
          // of the grid
          <div
            className={classNames(styles.header, styles.filler)}
            ref={headerRef}
          />
        ) : (
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
              {showControls && onShareClick !== null && (
                <InviteButton
                  className={styles.invite}
                  onClick={onShareClick}
                />
              )}
            </RightNav>
          </Header>
        ))}
      <RoomAudioRenderer />
      {renderContent()}
      <CallEventAudioRenderer vm={vm} />
      <ReactionsAudioRenderer vm={vm} />
      <ReactionsOverlay vm={vm} />
      {footer}
      {layout.type !== "pip" && (
        <>
          <RageshakeRequestModal {...rageshakeRequestModalProps} />
          <SettingsModal
            client={client}
            roomId={rtcSession.room.roomId}
            open={settingsModalOpen}
            onDismiss={closeSettings}
            tab={settingsTab}
            onTabChange={setSettingsTab}
          />
        </>
      )}
    </div>
  );
};
