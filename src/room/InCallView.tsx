/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room as MatrixRoom } from "matrix-js-sdk";
import {
  type FC,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
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
import { useTranslation } from "react-i18next";

import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { HeaderStyle, useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { type MuteStates } from "../state/MuteStates";
import { type MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
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
import { prefetchSounds } from "../soundUtils";
import { useAudioContext } from "../useAudioContext";
import ringtoneMp3 from "../sound/ringtone.mp3?url";
import ringtoneOgg from "../sound/ringtone.ogg?url";
import { useTrackProcessorObservable$ } from "../livekit/TrackProcessorContext.tsx";
import { type Layout } from "../state/layout-types.ts";
import { ObservableScope } from "../state/ObservableScope.ts";
import { useLatest } from "../useLatest.ts";
import { CallFooter } from "../components/CallFooter.tsx";
import { SettingsIconButton } from "../button/Button.tsx";

const logger = rootLogger.getChild("[InCallView]");

export interface ActiveCallProps extends Omit<
  InCallViewProps,
  "vm" | "livekitRoom" | "connState"
> {
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
  onShareClick: (() => void) | null;
}

export const InCallView: FC<InCallViewProps> = ({
  client,
  vm,
  matrixInfo,
  matrixRoom,
  muteStates,
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

  const { showControls, header: headerStyle } = useUrlParams();

  const muteAllAudio = useBehavior(muteAllAudio$);

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
  const latestPickupPhaseAudio = useLatest(pickupPhaseAudio);

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

  const ringing = useBehavior(vm.ringing$);
  const audioParticipants = useBehavior(vm.livekitRoomItems$);
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

  const fatalCallError = useBehavior(vm.fatalError$);
  // Stop the rendering and throw for the error boundary
  if (fatalCallError) {
    logger.debug("fatalCallError stop rendering", fatalCallError);
    throw fatalCallError;
  }

  // While ringing, loop the ringtone
  useEffect((): void | (() => void) => {
    const audio = latestPickupPhaseAudio.current;
    if (ringing && audio) {
      const endSound = audio.playSoundLooping(
        "waiting",
        audio.soundDuration["waiting"] ?? 1,
      );
      return () => {
        void endSound().catch((e) => {
          logger.error("Failed to stop ringing sound", e);
        });
      };
    }
  }, [ringing, latestPickupPhaseAudio]);

  const onViewClick = useCallback(
    (e: ReactMouseEvent) => {
      if (
        (e.nativeEvent as PointerEvent).pointerType === "touch" &&
        // If an interactive element was tapped, don't count this as a tap on the screen
        (e.target as Element).closest?.("button, input") === null
      )
        vm.tapScreen();
    },
    [vm],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
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

  useAppBarHidden(!showHeader);

  let header: ReactNode = null;
  if (showHeader) {
    switch (headerStyle) {
      case HeaderStyle.AppBar: {
        // dont build a header here. The AppBar will take care of it.
        break;
      }
      case HeaderStyle.None:
        // Cosmetic header to fill out space while still affecting the bounds of
        // the grid
        header = (
          <div
            className={classNames(styles.header, styles.filler)}
            ref={headerRef}
          />
        );
        break;
      case HeaderStyle.Standard:
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
          targetWidth={gridBounds.width}
          targetHeight={gridBounds.height}
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

  const settingsButtonInAppBar =
    headerStyle === HeaderStyle.AppBar && showHeader;
  useAppBarSecondaryButton(
    <SettingsIconButton
      key="settings"
      onClick={openSettings}
      data-testid="settings-app-bar"
    />,
  );

  // Only hide the settings button if we have an AppBar header and we are showing the header
  const footer = (
    <CallFooter
      ref={footerRef}
      hidden={!showFooter}
      hideControls={!showControls}
      asOverlay={windowMode === "flat"}
      asPip={layout.type === "pip"}
      // Hide the logo for both embedded solutions. mobile: HeaderStyle.AppBar and desktop: HeaderStyle.None.
      hideLogo={headerStyle !== HeaderStyle.Standard}
      layoutMode={gridMode}
      setLayoutMode={setGridMode}
      audioEnabled={audioEnabled}
      toggleAudio={toggleAudio ?? undefined}
      videoEnabled={videoEnabled}
      toggleVideo={toggleVideo ?? undefined}
      sharingScreen={sharingScreen}
      toggleScreenSharing={vm.toggleScreenSharing ?? undefined}
      reactionIdentifier={`${client.getUserId()}:${client.getDeviceId()}`}
      reactionData={supportsReactions ? vm : undefined}
      audioOutputSwitcher={audioOutputSwitcher ?? undefined}
      // Only pass the openSettings function if the settings button is not in the app bar.
      // If there is no fn the button will be hidden in the footer.
      openSettings={settingsButtonInAppBar ? undefined : openSettings}
      hangup={vm.hangup}
      //Debug props
      debugTileLayout={debugTileLayout}
      tileStoreGeneration={tileStoreGeneration}
    />
  );
  const allConnections = useBehavior(vm.allConnections$);

  return (
    // The onClick handler here exists to control the visibility of the footer,
    // and the footer is also viewable by moving focus into it, so this is fine.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={styles.inRoom}
      ref={containerRef}
      onClick={onViewClick}
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
            livekitRooms={allConnections
              .getConnections()
              .map((connectionItem) => ({
                room: connectionItem.livekitRoom,
                livekitAlias: connectionItem.livekitAlias,
                // TODO compute is local or tag it in the livekit room items already
                isLocal: undefined,
                url: connectionItem.transport.livekit_service_url,
              }))}
          />
        </>
      )}
    </div>
  );
};
