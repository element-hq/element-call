/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type Ref, useMemo } from "react";
import classNames from "classnames";
import { BehaviorSubject } from "rxjs";

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
import { type GridMode } from "../state/CallViewModel/CallViewModel";
import {
  MediaMuteAndSwitchButton,
  type MenuOptions,
} from "./MediaMuteAndSwitchButton";

export interface AudioOutputSwitcher {
  targetOutput: string;
  switch: () => void;
}

export interface FooterProps {
  ref?: Ref<HTMLDivElement>;
  /** Children will only be visible if the component is wider than 5*/
  children?: JSX.Element | JSX.Element[] | false;

  audioEnabled: boolean;
  /** Also controls if the audioMute button is disabled */
  toggleAudio: (() => void) | undefined;
  videoEnabled: boolean;
  /** Also controls if the videoMute button is disabled */
  toggleVideo: (() => void) | undefined;

  /* This is needed for WindowMode = "flat" */
  hideControls?: boolean;
  /** hide the entire footer*/
  hidden?: boolean;
  /** Pip controls buttonSize and hides: settings button, layout switcher and logo */
  asPip?: boolean;
  /** The footer should be used as an overlay.
   * (Over the Call Grid) This saves spaces on small screens.*/
  asOverlay?: boolean;

  layoutMode?: GridMode;
  /** Also controls if the layout button is visible */
  setLayoutMode?: (mode: GridMode) => void;

  sharingScreen?: boolean;
  toggleScreenSharing?: () => void;

  /** Also controls if the audio button is visible */
  audioOutputSwitcher?: AudioOutputSwitcher;
  /** Also controls if the settings button is visible */
  openSettings?: () => void;
  /** Also controls if the hangup button is visible */
  hangup?: () => void;

  reactionIdentifier?: string;
  reactionData?: ReactionData;

  hideLogo?: boolean;
  // debug stuff
  debugTileLayout?: boolean;
  tileStoreGeneration?: number;

  audioOptions?: MenuOptions[];
  videoOptions?: MenuOptions[];
  selectedAudio?: string;
  selectedVideo?: string;
  selectAudioDevice?: (deviceId: string) => void;
  selectVideoDevice?: (deviceId: string) => void;
}

export const CallFooter: FC<FooterProps> = ({
  ref,
  children,
  asOverlay,
  hidden,
  hideControls,
  hideLogo,
  asPip,
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

  audioOptions,
  videoOptions,
  selectedAudio,
  selectedVideo,
  selectAudioDevice,
  selectVideoDevice,
}) => {
  const buttons: JSX.Element[] = [];
  const buttonSize = asPip ? "md" : "lg";
  const showSettingsButton =
    openSettings !== undefined && !asPip && !hideControls;
  const showLayoutSwitcher = !asPip && !hideControls;
  const showLogoDebugContainer = !asPip || (!hideLogo && !debugTileLayout);
  const showLogo = !hideLogo && !asPip;
  if (showSettingsButton) {
    // add the settings button to the center group of buttons, so it will be visible on small screens.
    // On larger screens, it will be hidden SettingsIconButton the one with `showForScreenWidth = "wide"` in the `settingsLogoContainer` will be visible.
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
        onSelect={selectAudioDevice}
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
        selectedOption={selectedVideo}
        onSelect={selectVideoDevice}
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
        reactionData={
          reactionData ?? {
            handsRaised$: new BehaviorSubject({}),
            reactions$: new BehaviorSubject({}),
          }
        }
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
        [styles.hidden]: hidden,
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
      {setLayoutMode && layoutMode && showLayoutSwitcher && (
        <LayoutToggle
          className={styles.layout}
          layout={layoutMode}
          setLayout={setLayoutMode}
        />
      )}
    </div>
  );
};
