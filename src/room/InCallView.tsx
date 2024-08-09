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
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import { ConnectionState, Room } from "livekit-client";
import { MatrixClient } from "matrix-js-sdk/src/client";
import {
  FC,
  PointerEvent,
  PropsWithoutRef,
  TouchEvent,
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
import { BehaviorSubject, of } from "rxjs";
import { useObservableEagerState } from "observable-hooks";

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
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useLiveKit } from "../livekit/useLiveKit";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { MuteStates } from "./MuteStates";
import { MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import { ECConnectionState } from "../livekit/useECConnectionState";
import { useOpenIDSFU } from "../livekit/openIDSFU";
import { GridMode, Layout, useCallViewModel } from "../state/CallViewModel";
import { Grid, TileProps } from "../grid/Grid";
import { useObservable } from "../state/useObservable";
import { useInitial } from "../useInitial";
import { SpotlightTile } from "../tile/SpotlightTile";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { makeGridLayout } from "../grid/GridLayout";
import {
  CallLayoutOutputs,
  TileModel,
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../grid/CallLayout";
import { makeOneOnOneLayout } from "../grid/OneOnOneLayout";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { makeSpotlightLandscapeLayout } from "../grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../grid/SpotlightPortraitLayout";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});

const maxTapDurationMs = 400;

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
  connState,
  onShareClick,
}) => {
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

  const mobile = boundsValid && bounds.width <= 660;
  const reducedControls = boundsValid && bounds.width <= 340;
  const noControls = reducedControls && bounds.height <= 400;

  const vm = useCallViewModel(
    rtcSession.room,
    livekitRoom,
    matrixInfo.e2eeSystem.kind !== E2eeType.NONE,
    connState,
  );
  const windowMode = useObservableEagerState(vm.windowMode);
  const layout = useObservableEagerState(vm.layout);
  const gridMode = useObservableEagerState(vm.gridMode);
  const showHeader = useObservableEagerState(vm.showHeader);
  const showFooter = useObservableEagerState(vm.showFooter);

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

  // We also need to tell the layout toggle to prevent touch events from
  // bubbling up, or else the controls will be dismissed before a change event
  // can be registered on the toggle
  const onLayoutToggleTouchEnd = useCallback(
    (e: TouchEvent) => e.stopPropagation(),
    [],
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

  const openProfile = useCallback(() => {
    setSettingsTab("profile");
    setSettingsModalOpen(true);
  }, [setSettingsTab, setSettingsModalOpen]);

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
  const gridBoundsObservable = useObservable(gridBounds);

  const spotlightAlignment = useInitial(
    () => new BehaviorSubject(defaultSpotlightAlignment),
  );
  const pipAlignment = useInitial(
    () => new BehaviorSubject(defaultPipAlignment),
  );

  const setGridMode = useCallback(
    (mode: GridMode) => vm.setGridMode(mode),
    [vm],
  );

  useEffect(() => {
    widget?.api.transport.send(
      gridMode === "grid"
        ? ElementWidgetActions.TileLayout
        : ElementWidgetActions.SpotlightLayout,
      {},
    );
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
        PropsWithoutRef<TileProps<TileModel, HTMLDivElement>>
      >(function Tile(
        { className, style, targetWidth, targetHeight, model },
        ref,
      ) {
        const spotlightExpanded = useObservableEagerState(vm.spotlightExpanded);
        const onToggleExpanded = useObservableEagerState(
          vm.toggleSpotlightExpanded,
        );
        const showVideo = useObservableEagerState(
          useMemo(
            () =>
              model.type === "grid" ? vm.showGridVideo(model.vm) : of(true),
            [model],
          ),
        );
        const showSpeakingIndicatorsValue = useObservableEagerState(
          vm.showSpeakingIndicators,
        );
        const showSpotlightIndicatorsValue = useObservableEagerState(
          vm.showSpotlightIndicators,
        );

        return model.type === "grid" ? (
          <GridTile
            ref={ref}
            vm={model.vm}
            onOpenProfile={openProfile}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            className={classNames(className, styles.tile)}
            style={style}
            showVideo={showVideo}
            showSpeakingIndicators={showSpeakingIndicatorsValue}
          />
        ) : (
          <SpotlightTile
            ref={ref}
            vms={model.vms}
            maximised={model.maximised}
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
      minBounds: gridBoundsObservable,
      spotlightAlignment,
      pipAlignment,
    };
    return {
      grid: makeGridLayout(inputs),
      "spotlight-landscape": makeSpotlightLandscapeLayout(inputs),
      "spotlight-portrait": makeSpotlightPortraitLayout(inputs),
      "spotlight-expanded": makeSpotlightExpandedLayout(inputs),
      "one-on-one": makeOneOnOneLayout(inputs),
    };
  }, [gridBoundsObservable, spotlightAlignment, pipAlignment]);

  const renderContent = (): JSX.Element => {
    if (layout.type === "pip") {
      return (
        <SpotlightTile
          className={classNames(styles.tile, styles.maximised)}
          vms={layout.spotlight!}
          maximised
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

  const toggleScreensharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
      audio: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
      systemAudio: "include",
    });
  }, [localParticipant, isScreenShareEnabled]);

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
        className={classNames(styles.footer, {
          [styles.overlay]: windowMode === "flat",
          [styles.hidden]: !showFooter || (!showControls && hideHeader),
        })}
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
        {!mobile && showControls && (
          <LayoutToggle
            className={styles.layout}
            layout={gridMode}
            setLayout={setGridMode}
            onTouchEnd={onLayoutToggleTouchEnd}
          />
        )}
      </div>
    );
  }

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
              {!reducedControls && showControls && onShareClick !== null && (
                <InviteButton onClick={onShareClick} />
              )}
            </RightNav>
          </Header>
        ))}
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
