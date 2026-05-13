/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type Ref, useMemo } from "react";
import classNames from "classnames";
import {
  SpotlightIcon,
  GridIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { Switch } from "@vector-im/compound-web";
import { t } from "i18next";

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
import { type GridMode } from "../state/CallViewModel/CallViewModel";
import {
  MediaMuteAndSwitchButton,
  type MenuOptions,
  type ToggleOption,
} from "./MediaMuteAndSwitchButton";
import { type ViewModel, useViewModel } from "../state/ViewModel";

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

  /** Providing no options `[]` or `undefined` will imply that we dont have a audio fast switcher */
  audioOptions?: MenuOptions[];
  /** Providing no options `[]` or `undefined` will imply that we dont have a audio fast switcher */
  videoOptions?: MenuOptions[];
  selectedAudio?: string;
  selectedVideo?: string;
  selectAudioButtonOption?: (deviceId: string) => void;
  selectVideoButtonOption?: (option: string) => void;
  videoToggles?: ToggleOption[];
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
        {(showLogo || debugTileLayout) && logoDebugContainer}
      </div>
      {!hideControls && <div className={styles.buttons}>{buttons}</div>}
      {!hideControls && setLayoutMode && layoutMode && (
        <Switch<"spotlight", "grid">
          name="layoutMode"
          aria-label={t("layout_switch_label")}
          leftLabel={t("layout_spotlight_label")}
          leftValue="spotlight"
          leftIcon={SpotlightIcon}
          rightLabel={t("layout_grid_label")}
          rightValue="grid"
          rightIcon={GridIcon}
          className={styles.layout}
          value={layoutMode}
          onChange={setLayoutMode}
        />
      )}
    </div>
  );
};
