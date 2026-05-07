/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type Ref, useMemo } from "react";
import classNames from "classnames";
import { combineLatest, map } from "rxjs";
import { supportsBackgroundProcessors } from "@livekit/track-processors";

import LogoMark from "../icons/LogoMark.svg?react";
import LogoType from "../icons/LogoType.svg?react";
import {
  EndCallButton,
  MicButton,
  VideoButton,
  ShareScreenButton,
  SettingsButton,
  ReactionToggleButton,
  LoudspeakerButton,
  SettingsIconButton,
  type ReactionData,
} from "../button";
import styles from "./CallFooter.module.css";
import { LayoutToggle } from "../room/LayoutToggle";
import {
  type CallViewModel,
  type GridMode,
} from "../state/CallViewModel/CallViewModel";
import {
  MediaMuteAndSwitchButton,
  type MenuOptions,
  type ToggleOption,
} from "./MediaMuteAndSwitchButton";
import { type MediaDevices } from "../state/MediaDevices";
import { mediaDeviceLabelToString } from "../settings/DeviceSelection";
import {
  backgroundBlur as backgroundBlurSettings,
  debugTileLayout as debugTileLayoutSetting,
} from "../settings/settings";
import { constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { type ViewModel, useViewModel } from "../state/ViewModel";
import { getUrlParams, HeaderStyle } from "../UrlParams";

export interface AudioOutputSwitcher {
  targetOutput: string;
  switch: () => void;
}

export interface FooterSnapshot {
  audioEnabled: boolean;
  /** Also controls if the audioMute button is disabled */
  toggleAudio: (() => void) | undefined;

  videoEnabled: boolean;
  /** Also controls if the videoMute button is disabled */
  toggleVideo: (() => void) | undefined;

  /* This is needed for WindowMode = "flat" */
  hideControls?: boolean;
  /** The footer should be used as an overlay.
   * (Over the Call Grid) This saves spaces on small screens. */
  asOverlay?: boolean;

  buttonSize: "md" | "lg";
  showSettingsButton?: boolean;
  showLayoutSwitcher?: boolean;
  showLogoDebugContainer?: boolean;
  showLogo?: boolean;

  layoutMode?: GridMode;
  /** Also controls if the layout button is visible */
  setLayoutMode?: (mode: GridMode) => void;

  sharingScreen?: boolean;
  toggleScreenSharing?: () => void;

  /** Also controls if the audio output button is visible */
  audioOutputSwitcher?: AudioOutputSwitcher;
  /** Also controls if the settings button is visible */
  openSettings?: () => void;
  /** Also controls if the hangup button is visible */
  hangup?: () => void;

  reactionIdentifier?: string;
  reactionData?: ReactionData;

  // debug stuff
  debugTileLayout?: boolean;
  tileStoreGeneration?: number;

  audioOptions?: MenuOptions[];
  videoOptions?: MenuOptions[];
  selectedAudio?: string;
  selectedVideo?: string;
  selectAudioButtonOption?: (deviceId: string) => void;
  selectVideoButtonOption?: (option: string) => void;
  videoToggles?: ToggleOption[];
}

/**
 * Shared helper: maps MuteStates into the audio/video enabled + toggle behaviors
 * needed by FooterSnapshot.
 */
function buildMuteBehaviors(
  scope: ObservableScope,
  muteStates: MuteStates,
): Pick<
  ViewModel<FooterSnapshot>,
  "audioEnabled" | "toggleAudio" | "videoEnabled" | "toggleVideo"
> {
  return {
    audioEnabled: muteStates.audio.enabled$,
    toggleAudio: scope.behavior(
      muteStates.audio.toggle$.pipe(map((t) => t ?? undefined)),
    ),
    videoEnabled: muteStates.video.enabled$,
    toggleVideo: scope.behavior(
      muteStates.video.toggle$.pipe(map((t) => t ?? undefined)),
    ),
  };
}

/**
 * Shared helper: maps MediaDevices into the audio/video device-list behaviors
 * needed by FooterSnapshot (options, selection, callbacks, blur toggle).
 */
function buildDeviceBehaviors(
  scope: ObservableScope,
  mediaDevices: MediaDevices,
): Pick<
  ViewModel<FooterSnapshot>,
  | "audioOptions"
  | "selectedAudio"
  | "selectAudioButtonOption"
  | "videoOptions"
  | "selectedVideo"
  | "selectVideoButtonOption"
  | "videoToggles"
> {
  return {
    audioOptions: scope.behavior(
      mediaDevices.audioInput.available$.pipe(
        map((available) =>
          [...available.entries()].map(([id, label]) => ({
            id,
            label: mediaDeviceLabelToString(label, (n) => "Audio Device " + n),
          })),
        ),
      ),
    ),
    selectedAudio: scope.behavior(
      mediaDevices.audioInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectAudioButtonOption: constant(mediaDevices.audioInput.select),
    videoOptions: scope.behavior(
      mediaDevices.videoInput.available$.pipe(
        map((available) =>
          [...available.entries()].map(([id, label]) => ({
            id,
            label: mediaDeviceLabelToString(label, (n) => "Camera " + n),
          })),
        ),
      ),
    ),
    selectedVideo: scope.behavior(
      mediaDevices.videoInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectVideoButtonOption: scope.behavior(
      backgroundBlurSettings.value$.pipe(
        map((current) => {
          return (option: string) => {
            if (option === "blur") {
              backgroundBlurSettings.setValue(!current);
            } else {
              mediaDevices.videoInput.select(option);
            }
          };
        }),
      ),
    ),
    videoToggles: scope.behavior(
      backgroundBlurSettings.value$.pipe(
        map((blurActive) =>
          supportsBackgroundProcessors()
            ? [{ id: "blur", enabled: blurActive, label: "Blur Background" }]
            : [],
        ),
      ),
    ),
  };
}

/**
 * Creates the ViewModel for the CallFooter.
 *
 * @param scope - ObservableScope that bounds the lifetime of derived behaviors.
 * @param vm - The root CallViewModel; provides layout, grid mode, reactions, etc.
 * @param muteStates - Audio and video mute state + toggles.
 * @param mediaDevices - Available and selected input devices.
 * @param openSettings - Callback to open the settings modal, or undefined if the
 *   settings button should be hidden (e.g. when it is already shown in an app bar).
 * @param hideControls - When true the button row is hidden (from URL param).
 * @param reactionIdentifier - The local user's reaction identifier string, or
 *   undefined when reactions are not supported (hides the reaction button).
 */
export function createCallFooterViewModel(
  scope: ObservableScope,
  callModel: CallViewModel,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  openSettings: (() => void) | undefined,
  reactionIdentifier: string | undefined,
): ViewModel<FooterSnapshot> {
  const { showControls, header: headerStyle } = getUrlParams();

  const hideLogo = headerStyle !== HeaderStyle.Standard;

  return {
    ...buildMuteBehaviors(scope, muteStates),

    // ── Visibility / sizing ──────────────────────────────────────────────────
    hideControls: constant(!showControls),
    asOverlay: scope.behavior(
      callModel.windowMode$.pipe(map((mode) => mode === "flat")),
    ),
    buttonSize: scope.behavior(
      callModel.layout$.pipe(
        map((l) => (l.type === "pip" ? "md" : "lg") as "md" | "lg"),
      ),
    ),
    showSettingsButton: scope.behavior(
      combineLatest([callModel.layout$, callModel.showHeader$]).pipe(
        map(
          ([l, showHeader]) =>
            openSettings !== undefined &&
            l.type !== "pip" &&
            showControls &&
            !(headerStyle === HeaderStyle.AppBar && showHeader),
        ),
      ),
    ),
    showLayoutSwitcher: scope.behavior(
      callModel.layout$.pipe(map((l) => l.type !== "pip" && showControls)),
    ),
    showLogoDebugContainer: scope.behavior(
      combineLatest([callModel.layout$, debugTileLayoutSetting.value$]).pipe(
        map(([l, debugTile]) => l.type !== "pip" || (!hideLogo && !debugTile)),
      ),
    ),
    showLogo: scope.behavior(
      callModel.layout$.pipe(map((l) => !hideLogo && l.type !== "pip")),
    ),

    // ── Layout mode ───────────────────────────────────────────────────────────
    layoutMode: callModel.gridMode$,
    setLayoutMode: constant(callModel.setGridMode),

    // ── Screen sharing ────────────────────────────────────────────────────────
    sharingScreen: callModel.sharingScreen$,
    toggleScreenSharing: constant(callModel.toggleScreenSharing ?? undefined),

    // ── Audio output ─────────────────────────────────────────────────────────
    audioOutputSwitcher: scope.behavior(
      callModel.audioOutputSwitcher$.pipe(
        map((switcher) => switcher ?? undefined),
      ),
    ),

    // ── Actions ───────────────────────────────────────────────────────────────
    openSettings: scope.behavior(
      callModel.showHeader$.pipe(
        map((showHeader) =>
          headerStyle === HeaderStyle.AppBar && showHeader
            ? undefined
            : openSettings,
        ),
      ),
    ),
    hangup: constant(callModel.hangup),

    // ── Reactions ─────────────────────────────────────────────────────────────
    reactionIdentifier: constant(reactionIdentifier),
    reactionData: constant(
      reactionIdentifier !== undefined
        ? {
            handsRaised$: callModel.handsRaised$,
            reactions$: callModel.reactions$,
          }
        : undefined,
    ),

    // ── Debug ─────────────────────────────────────────────────────────────────
    debugTileLayout: debugTileLayoutSetting.value$,
    tileStoreGeneration: callModel.tileStoreGeneration$,

    ...buildDeviceBehaviors(scope, mediaDevices),
  };
}

/**
 * Creates a simplified ViewModel for the CallFooter used in the lobby
 * (pre-call) screen. Unlike createCallFooterViewModel, this does not require
 * a CallViewModel — it only needs mute states, device lists, and callbacks.
 *
 * @param scope - ObservableScope that bounds the lifetime of derived behaviors.
 * @param muteStates - Audio and video mute state + toggles.
 * @param mediaDevices - Available and selected input devices.
 * @param openSettings - Callback to open the settings modal, or undefined.
 * @param hangup - Callback to leave/cancel, or undefined (hides the button).
 * @param showLogo - Whether to show the Element Call logo.
 */
export function createLobbyFooterViewModel(
  scope: ObservableScope,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  openSettings: (() => void) | undefined,
  hangup: (() => void) | undefined,
  showLogo: boolean,
): ViewModel<FooterSnapshot> {
  return {
    ...buildMuteBehaviors(scope, muteStates),
    ...buildDeviceBehaviors(scope, mediaDevices),
    // ── Visibility / sizing ───────────────────────────────────────────────────
    hideControls: constant(false),
    asOverlay: constant(false),
    buttonSize: constant("lg"),
    showSettingsButton: constant(openSettings !== undefined),
    showLayoutSwitcher: constant(false),
    showLogoDebugContainer: constant(showLogo),
    showLogo: constant(showLogo),

    // ── Layout mode (not applicable in lobby) ─────────────────────────────────
    layoutMode: constant(undefined),
    setLayoutMode: constant(undefined),

    // ── Screen sharing (not applicable in lobby) ──────────────────────────────
    sharingScreen: constant(undefined),
    toggleScreenSharing: constant(undefined),

    // ── Audio output (not applicable in lobby) ────────────────────────────────
    audioOutputSwitcher: constant(undefined),

    // ── Actions ───────────────────────────────────────────────────────────────
    openSettings: constant(openSettings),
    hangup: constant(hangup),

    // ── Reactions (not applicable in lobby) ───────────────────────────────────
    reactionIdentifier: constant(undefined),
    reactionData: constant(undefined),

    // ── Debug (not needed in lobby) ───────────────────────────────────────────
    debugTileLayout: constant(false),
    tileStoreGeneration: constant(0),
  };
}

export interface FooterProps {
  ref?: Ref<HTMLDivElement>;
  children?: JSX.Element | JSX.Element[] | false;
  vm: ViewModel<FooterSnapshot>;
}
export const CallFooter: FC<FooterProps> = ({ ref, children, vm }) => {
  const {
    asOverlay,
    hideControls,
    layoutMode,
    setLayoutMode,
    openSettings,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    sharingScreen,
    toggleScreenSharing,
    reactionIdentifier,
    reactionData,
    audioOutputSwitcher,
    hangup,
    debugTileLayout,
    tileStoreGeneration,
    videoOptions,
    selectedVideo,
    audioOptions,
    selectedAudio,
    selectAudioButtonOption,
    selectVideoButtonOption,
    videoToggles,
    buttonSize,
    showSettingsButton,
    showLogoDebugContainer,
    showLogo,
  } = useViewModel(vm);

  const buttons: JSX.Element[] = [];

  if (showSettingsButton) {
    // Add the settings button to the center group so it's visible on small
    // screens. On larger screens the SettingsIconButton with
    // showForScreenWidth="wide" in the settingsLogoContainer is used instead.
    buttons.push(
      <SettingsButton
        key="settings"
        showForScreenWidth="narrow"
        onClick={openSettings}
        data-testid="settings-bottom-center"
      />,
    );
  }

  if ((audioOptions?.length ?? 0) > 0) {
    buttons.push(
      <MediaMuteAndSwitchButton
        title={"Mic Source"}
        key="audio"
        iconsAndLabels="audio"
        enabled={audioEnabled ?? false}
        onMuteClick={toggleAudio}
        data-testid="incall_mute"
        options={audioOptions}
        selectedOption={selectedAudio}
        onSelect={selectAudioButtonOption}
      />,
    );
  } else {
    buttons.push(
      <MicButton
        size={buttonSize}
        key="audio"
        enabled={audioEnabled ?? false}
        onClick={toggleAudio}
        disabled={toggleAudio === undefined}
        data-testid="incall_mute"
      />,
    );
  }

  if ((videoOptions?.length ?? 0) > 0) {
    buttons.push(
      <MediaMuteAndSwitchButton
        title={"Camera Source"}
        key="video"
        iconsAndLabels="video"
        enabled={videoEnabled ?? false}
        onMuteClick={toggleVideo}
        data-testid="incall_videomute"
        options={videoOptions}
        toggles={videoToggles}
        selectedOption={selectedVideo}
        onSelect={selectVideoButtonOption}
      />,
    );
  } else {
    buttons.push(
      <VideoButton
        size={buttonSize}
        key="video"
        enabled={videoEnabled ?? false}
        onClick={toggleVideo}
        disabled={toggleVideo === undefined}
        data-testid="incall_videomute"
      />,
    );
  }

  if (toggleScreenSharing !== undefined) {
    buttons.push(
      <ShareScreenButton
        size={buttonSize}
        key="share_screen"
        className={styles.shareScreen}
        enabled={sharingScreen ?? false}
        onClick={toggleScreenSharing}
        data-testid="incall_screenshare"
      />,
    );
  }

  if (reactionIdentifier && reactionData) {
    buttons.push(
      <ReactionToggleButton
        size={buttonSize}
        reactionData={reactionData}
        key="raise_hand"
        className={styles.raiseHand}
        identifier={reactionIdentifier}
      />,
    );
  }

  // In this PR we just move the button to the bottom bar. We do not yet update its appearance
  const audioOutputButton = useMemo(() => {
    if (audioOutputSwitcher === undefined) return null;
    return (
      <LoudspeakerButton
        size={buttonSize}
        onClick={() => audioOutputSwitcher.switch()}
        loudspeakerModeEnabled={audioOutputSwitcher.targetOutput === "earpiece"}
      />
    );
  }, [audioOutputSwitcher, buttonSize]);

  if (audioOutputButton) buttons.push(audioOutputButton);

  if (hangup)
    buttons.push(
      <EndCallButton
        size={buttonSize}
        key="end_call"
        onClick={hangup}
        data-testid="incall_leave"
      />,
    );

  const logoDebugContainer = (
    <div className={styles.logo}>
      {showLogo && (
        <>
          <LogoMark width={24} height={24} aria-hidden />
          <LogoType
            width={80}
            height={11}
            aria-label={import.meta.env.VITE_PRODUCT_NAME || "Element Call"}
          />
        </>
      )}
      {debugTileLayout ? `Tiles generation: ${tileStoreGeneration}` : undefined}
    </div>
  );

  return (
    <div
      ref={ref}
      className={classNames(styles.footer, {
        [styles.overlay]: asOverlay,
      })}
    >
      <div className={styles.settingsLogoContainer}>
        {showSettingsButton && (
          <SettingsIconButton
            key="settings"
            kind="secondary"
            showForScreenWidth="wide"
            onClick={openSettings}
            data-testid="settings-bottom-left"
          />
        )}
        {children}
        {showLogoDebugContainer && logoDebugContainer}
      </div>
      {!hideControls && <div className={styles.buttons}>{buttons}</div>}
      {setLayoutMode && layoutMode && (
        <LayoutToggle
          className={styles.layout}
          layout={layoutMode}
          setLayout={setLayoutMode}
        />
      )}
    </div>
  );
};
