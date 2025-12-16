/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { IconButton, Text, Tooltip } from "@vector-im/compound-web";
import { type MatrixClient, type Room as MatrixRoom } from "matrix-js-sdk";
import {
  type FC,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import classNames from "classnames";
import { BehaviorSubject, map } from "rxjs";
import { useObservable } from "observable-hooks";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  VoiceCallSolidIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";

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
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { type HeaderStyle, useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { type OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { type MuteStates } from "../state/MuteStates";
import { type MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import {
  type CallViewModel,
  createCallViewModel$,
  type GridMode,
} from "../state/CallViewModel/CallViewModel.ts";
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
import { ReactionsOverlay } from "./ReactionsOverlay";
import { CallEventAudioRenderer } from "./CallEventAudioRenderer";
import {
  debugTileLayout as debugTileLayoutSetting,
  matrixRTCMode as matrixRTCModeSetting,
  useSetting,
} from "../settings/settings";
import { ReactionsReader } from "../reactions/ReactionsReader";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer.tsx";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";
import { useMediaDevices } from "../MediaDevicesContext.ts";
import { EarpieceOverlay } from "./EarpieceOverlay.tsx";
import { useAppBarHidden, useAppBarSecondaryButton } from "../AppBar.tsx";
import { useBehavior } from "../useBehavior.ts";
import { Toast } from "../Toast.tsx";
import overlayStyles from "../Overlay.module.css";
import { Avatar, Size as AvatarSize } from "../Avatar";
import waitingStyles from "./WaitingForJoin.module.css";
import { prefetchSounds } from "../soundUtils";
import { useAudioContext } from "../useAudioContext";
import ringtoneMp3 from "../sound/ringtone.mp3?url";
import ringtoneOgg from "../sound/ringtone.ogg?url";
import { useTrackProcessorObservable$ } from "../livekit/TrackProcessorContext.tsx";
import { type Layout } from "../state/layout-types.ts";
import { ObservableScope } from "../state/ObservableScope.ts";

const logger = rootLogger.getChild("[InCallView]");

const maxTapDurationMs = 400;

export interface ActiveCallProps
  extends Omit<InCallViewProps, "vm" | "livekitRoom" | "connState"> {
  e2eeSystem: EncryptionSystem;
  // TODO refactor those reasons into an enum
  onLeft: (
    reason: "user" | "timeout" | "decline" | "allOthersLeft" | "error",
  ) => void;
}

export const ActiveCall: FC<ActiveCallProps> = (props) => {
  const [vm, setVm] = useState<CallViewModel | null>(null);

  const urlParams = useUrlParams();
  const mediaDevices = useMediaDevices();
  const trackProcessorState$ = useTrackProcessorObservable$();
  useEffect(() => {
    logger.info("START CALL VIEW SCOPE");
    const scope = new ObservableScope();
    const reactionsReader = new ReactionsReader(scope, props.rtcSession);
    const { autoLeaveWhenOthersLeft, waitForCallPickup, sendNotificationType } =
      urlParams;
    const vm = createCallViewModel$(
      scope,
      props.rtcSession,
      props.matrixRoom,
      mediaDevices,
      props.muteStates,
      {
        encryptionSystem: props.e2eeSystem,
        autoLeaveWhenOthersLeft,
        waitForCallPickup: waitForCallPickup && sendNotificationType === "ring",
        matrixRTCMode$: matrixRTCModeSetting.value$,
      },
      reactionsReader.raisedHands$,
      reactionsReader.reactions$,
      scope.behavior(trackProcessorState$),
    );
    // TODO move this somewhere else once we use the callViewModel in the lobby as well!
    vm.join();
    setVm(vm);

    vm.leave$.pipe(scope.bind()).subscribe(props.onLeft);

    return (): void => {
      logger.info("END CALL VIEW SCOPE");
      scope.end();
    };
  }, [
    props.rtcSession,
    props.matrixRoom,
    props.muteStates,
    props.e2eeSystem,
    props.onLeft,
    urlParams,
    mediaDevices,
    trackProcessorState$,
  ]);

  if (vm === null) return null;

  return (
    <ReactionsSenderProvider vm={vm} rtcSession={props.rtcSession}>
      <InCallView {...props} vm={vm} />
    </ReactionsSenderProvider>
  );
};

export interface InCallViewProps {
  client: MatrixClient;
  vm: CallViewModel;
  matrixInfo: MatrixInfo;
  rtcSession: MatrixRTCSession;
  matrixRoom: MatrixRoom;
  muteStates: MuteStates;
  header: HeaderStyle;
  otelGroupCallMembership?: OTelGroupCallMembership;
  onShareClick: (() => void) | null;
}

export const InCallView: FC<InCallViewProps> = ({
  client,
  vm,
  matrixInfo,
  matrixRoom,
  muteStates,

  header: headerStyle,
  onShareClick,
}) => {
  const { t } = useTranslation();
  const { supportsReactions, sendReaction, toggleRaisedHand } =
    useReactionsSender();

  useWakeLock();
  // TODO-MULTI-SFU This is unused now??
  // const connectionState = useObservableEagerState(vm.livekitConnectionState$);

  // annoyingly we don't get the disconnection reason this way,
  // only by listening for the emitted event
  // This needs to be done differential. with the vm connection state we start with Disconnected.
  // TODO-MULTI-SFU decide how to handle this properly
  // @BillCarsonFr
  // if (connectionState === ConnectionState.Disconnected)
  //   throw new ConnectionLostError();

  const containerRef1 = useRef<HTMLDivElement | null>(null);
  const [containerRef2, bounds] = useMeasure();
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

  const { showControls } = useUrlParams();

  const muteAllAudio = useBehavior(muteAllAudio$);
  // Call pickup state and display names are needed for waiting overlay/sounds
  const callPickupState = useBehavior(vm.callPickupState$);

  // Preload a waiting and decline sounds
  const pickupPhaseSoundCache = useInitial(async () => {
    return prefetchSounds({
      waiting: { mp3: ringtoneMp3, ogg: ringtoneOgg },
    });
  });

  const pickupPhaseAudio = useAudioContext({
    sounds: pickupPhaseSoundCache,
    latencyHint: "interactive",
    muted: muteAllAudio,
  });

  const audioEnabled = useBehavior(muteStates.audio.enabled$);
  const videoEnabled = useBehavior(muteStates.video.enabled$);
  const toggleAudio = useBehavior(muteStates.audio.toggle$);
  const toggleVideo = useBehavior(muteStates.video.toggle$);
  const setAudioEnabled = useBehavior(muteStates.audio.setEnabled$);

  // This function incorrectly assumes that there is a camera and microphone, which is not always the case.
  // TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
  useCallViewKeyboardShortcuts(
    containerRef1,
    toggleAudio,
    toggleVideo,
    setAudioEnabled,
    (reaction) => void sendReaction(reaction),
    () => void toggleRaisedHand(),
  );

  const audioParticipants = useBehavior(vm.audioParticipants$);
  const participantCount = useBehavior(vm.participantCount$);
  const reconnecting = useBehavior(vm.reconnecting$);
  const windowMode = useBehavior(vm.windowMode$);
  const layout = useBehavior(vm.layout$);
  const tileStoreGeneration = useBehavior(vm.tileStoreGeneration$);
  const [debugTileLayout] = useSetting(debugTileLayoutSetting);
  const gridMode = useBehavior(vm.gridMode$);
  const showHeader = useBehavior(vm.showHeader$);
  const showFooter = useBehavior(vm.showFooter$);
  const earpieceMode = useBehavior(vm.earpieceMode$);
  const audioOutputSwitcher = useBehavior(vm.audioOutputSwitcher$);
  const sharingScreen = useBehavior(vm.sharingScreen$);

  const ringOverlay = useBehavior(vm.ringOverlay$);
  const fatalCallError = useBehavior(vm.fatalError$);
  // Stop the rendering and throw for the error boundary
  if (fatalCallError) {
    logger.debug("fatalCallError stop rendering", fatalCallError);
    throw fatalCallError;
  }

  // We need to set the proper timings on the animation based upon the sound length.
  const ringDuration = pickupPhaseAudio?.soundDuration["waiting"] ?? 1;
  useEffect((): (() => void) => {
    // The CSS animation includes the delay, so we must double the length of the sound.
    window.document.body.style.setProperty(
      "--call-ring-duration-s",
      `${ringDuration * 2}s`,
    );
    window.document.body.style.setProperty(
      "--call-ring-delay-s",
      `${ringDuration}s`,
    );
    // Remove properties when we unload.
    return () => {
      window.document.body.style.removeProperty("--call-ring-duration-s");
      window.document.body.style.removeProperty("--call-ring-delay-s");
    };
  }, [pickupPhaseAudio?.soundDuration, ringDuration]);

  // When waiting for pickup, loop a waiting sound
  useEffect((): void | (() => void) => {
    if (callPickupState !== "ringing" || !pickupPhaseAudio) return;
    const endSound = pickupPhaseAudio.playSoundLooping("waiting", ringDuration);
    return () => {
      void endSound().catch((e) => {
        logger.error("Failed to stop ringing sound", e);
      });
    };
  }, [callPickupState, pickupPhaseAudio, ringDuration]);

  // Waiting UI overlay
  const waitingOverlay: JSX.Element | null = useMemo(() => {
    return ringOverlay ? (
      <div className={classNames(overlayStyles.bg, waitingStyles.overlay)}>
        <div
          className={classNames(overlayStyles.content, waitingStyles.content)}
        >
          <div className={waitingStyles.pulse}>
            <Avatar
              id={ringOverlay.idForAvatar}
              name={ringOverlay.name}
              src={ringOverlay.avatarMxc}
              size={AvatarSize.XL}
            />
          </div>
          <Text size="md" className={waitingStyles.text}>
            {ringOverlay.text}
          </Text>
        </div>
      </div>
    ) : null;
  }, [ringOverlay]);

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

  useAppBarSecondaryButton(
    useMemo(() => {
      if (audioOutputSwitcher === null) return null;
      const isEarpieceTarget = audioOutputSwitcher.targetOutput === "earpiece";
      const Icon = isEarpieceTarget ? VoiceCallSolidIcon : VolumeOnSolidIcon;
      const label = isEarpieceTarget
        ? t("settings.devices.handset")
        : t("settings.devices.loudspeaker");

      return (
        <Tooltip label={label}>
          <IconButton
            onClick={(e) => {
              e.preventDefault();
              audioOutputSwitcher.switch();
            }}
          >
            <Icon />
          </IconButton>
        </Tooltip>
      );
    }, [t, audioOutputSwitcher]),
  );

  useAppBarHidden(!showHeader);

  let header: ReactNode = null;
  if (showHeader) {
    switch (headerStyle) {
      case "none":
        // Cosmetic header to fill out space while still affecting the bounds of
        // the grid
        header = (
          <div
            className={classNames(styles.header, styles.filler)}
            ref={headerRef}
          />
        );
        break;
      case "standard":
        header = (
          <Header
            className={styles.header}
            ref={headerRef}
            disconnectedBanner={false} // This screen has its own 'reconnecting' toast
          >
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
        );
    }
  }

  // The reconnecting toast cannot be dismissed
  const onDismissReconnectingToast = useCallback(() => {}, []);
  // We need to use a non-modal toast to avoid trapping focus within the toast.
  // However, a non-modal toast will not render any background overlay on its
  // own, so we must render one manually.
  const reconnectingToast = (
    <>
      <div
        className={classNames(overlayStyles.bg, overlayStyles.animate)}
        data-state={reconnecting ? "open" : "closed"}
      />
      <Toast
        onDismiss={onDismissReconnectingToast}
        open={reconnecting}
        modal={false}
      >
        {t("common.reconnecting")}
      </Toast>
    </>
  );

  const earpieceOverlay = (
    <EarpieceOverlay
      show={earpieceMode && !reconnecting}
      onBackToVideoPressed={audioOutputSwitcher?.switch}
    />
  );

  // If the reconnecting toast or earpiece overlay obscures the media tiles, we
  // need to remove them from the accessibility tree and block focus.
  const contentObscured = reconnecting || earpieceMode;

  const Tile = useMemo(
    () =>
      function Tile({
        ref,
        className,
        style,
        targetWidth,
        targetHeight,
        model,
      }: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
        const spotlightExpanded = useBehavior(vm.spotlightExpanded$);
        const onToggleExpanded = useBehavior(vm.toggleSpotlightExpanded$);
        const showSpeakingIndicatorsValue = useBehavior(
          vm.showSpeakingIndicators$,
        );
        const showSpotlightIndicatorsValue = useBehavior(
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
            focusable={!contentObscured}
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
            focusable={!contentObscured}
            className={classNames(className, styles.tile)}
            style={style}
          />
        );
      },
    [vm, openProfile, contentObscured],
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
          focusable={!contentObscured}
          aria-hidden={contentObscured}
        />
      );
    }

    const layers = layouts[layout.type] as CallLayoutOutputs<Layout>;
    const fixedGrid = (
      <Grid
        key="fixed"
        className={styles.fixedGrid}
        style={{
          insetBlockStart:
            headerBounds.height > 0 ? headerBounds.bottom : bounds.top,
          height: gridBounds.height,
        }}
        model={layout}
        Layout={layers.fixed}
        Tile={Tile}
        aria-hidden={contentObscured}
      />
    );
    const scrollingGrid = (
      <Grid
        key="scrolling"
        className={styles.scrollingGrid}
        model={layout}
        Layout={layers.scrolling}
        Tile={Tile}
        aria-hidden={contentObscured}
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
    matrixRoom.roomId,
  );

  const buttons: JSX.Element[] = [];

  buttons.push(
    <MicButton
      key="audio"
      muted={!audioEnabled}
      onClick={toggleAudio ?? undefined}
      onTouchEnd={onControlsTouchEnd}
      disabled={toggleAudio === null}
      data-testid="incall_mute"
    />,
    <VideoButton
      key="video"
      muted={!videoEnabled}
      onClick={toggleVideo ?? undefined}
      onTouchEnd={onControlsTouchEnd}
      disabled={toggleVideo === null}
      data-testid="incall_videomute"
    />,
  );
  if (vm.toggleScreenSharing !== null) {
    buttons.push(
      <ShareScreenButton
        key="share_screen"
        className={styles.shareScreen}
        enabled={sharingScreen}
        onClick={vm.toggleScreenSharing}
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
        vm.hangup();
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
        [styles.hidden]:
          !showFooter || (!showControls && headerStyle === "none"),
      })}
    >
      {headerStyle !== "none" && (
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
      {header}
      {audioParticipants.map(({ livekitRoom, url, participants }) => (
        <LivekitRoomAudioRenderer
          key={url}
          url={url}
          livekitRoom={livekitRoom}
          validIdentities={participants}
          muted={muteAllAudio}
        />
      ))}
      {renderContent()}
      <CallEventAudioRenderer vm={vm} muted={muteAllAudio} />
      <ReactionsAudioRenderer vm={vm} muted={muteAllAudio} />
      {reconnectingToast}
      {earpieceOverlay}
      <ReactionsOverlay vm={vm} />
      {waitingOverlay}
      {footer}
      {layout.type !== "pip" && (
        <>
          <RageshakeRequestModal {...rageshakeRequestModalProps} />
          <SettingsModal
            client={client}
            roomId={matrixRoom.roomId}
            open={settingsModalOpen}
            onDismiss={closeSettings}
            tab={settingsTab}
            onTabChange={setSettingsTab}
            // TODO expose correct data to setttings modal
            livekitRooms={[]}
          />
        </>
      )}
    </div>
  );
};
