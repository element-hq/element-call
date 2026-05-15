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
import { type ViewModel } from "../state/ViewModel";
import { useBehavior } from "../useBehavior";

export interface AudioOutputSwitcher {
  targetOutput: string;
  switch: () => void;
}

/**
 * The Snapshot combines all fields required to populate the view.
 *
 * It is a combination of Actions and State.
 * All Actions and State will be wrappen in behaviors.
 * This has the advantage, that actions can mutate.
 * (example: a device gets disconnected, the swicht action is not possible anymore, the actions becomes undefined)
 * With it being reactive we can use the existance of the action to update the rendering without
 * requiring additional state.
 *
 * Comment: It might not make sense to seperate the two interfaces. Hence the seperation
 * just happens on the syntax level with the `type = ... & ...` notation.
 */
export type FooterSnapshot = FooterActions & FooterState;
export interface FooterActions {
  /** Also controls if the audioMute button is disabled */
  toggleAudio: (() => void) | undefined;
  /** Also controls if the videoMute button is disabled */
  toggleVideo: (() => void) | undefined;
  /** Also controls if the layout button is visible */
  setLayoutMode: ((mode: GridMode) => void) | undefined;
  toggleScreenSharing: (() => void) | undefined;
  /** Also controls if the settings button is visible */
  openSettings: (() => void) | undefined;
  /** Also controls if the hangup button is visible */
  hangup: (() => void) | undefined;
}
// we do not use any ? optional properties so that the vm type is including all fields.
export interface FooterState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  showFooter: boolean;

  /* This is needed for WindowMode = "flat" */
  hideControls: boolean;
  /** The footer should be used as an overlay.
   * (Over the Call Grid) This saves spaces on small screens. */
  asOverlay: boolean;

  buttonSize: "md" | "lg";
  showSettingsButton: boolean;
  showLayoutSwitcher: boolean;
  showLogo: boolean;

  layoutMode: GridMode | undefined;

  sharingScreen: boolean;

  /** Also controls if the audio output button is visible */
  audioOutputSwitcher: AudioOutputSwitcher | undefined;

  reactionIdentifier: string | undefined;
  reactionData: ReactionData | undefined;

  // debug stuff
  debugTileLayout: boolean;
  tileStoreGeneration: number | undefined;

  /** Providing no options `[]` or `undefined` will imply that we dont have a audio fast switcher */
  audioOptions: MenuOptions[];
  /** Providing no options `[]` or `undefined` will imply that we dont have a audio fast switcher */
  videoOptions: MenuOptions[];
  selectedAudio: string | undefined;
  selectedVideo: string | undefined;
  selectAudioButtonOption: ((deviceId: string) => void) | undefined;
  selectVideoButtonOption: ((option: string) => void) | undefined;
  videoToggles: ToggleOption[];
}

export interface FooterProps {
  ref?: Ref<HTMLDivElement>;
  children?: JSX.Element | JSX.Element[] | false;
  vm: ViewModel<FooterSnapshot>;
}
export const CallFooter: FC<FooterProps> = ({ ref, children, vm }) => {
  const asOverlay = useBehavior(vm.asOverlay$);
  const showFooter = useBehavior(vm.showFooter$);
  const hideControls = useBehavior(vm.hideControls$);
  const layoutMode = useBehavior(vm.layoutMode$);
  const setLayoutMode = useBehavior(vm.setLayoutMode$);
  const openSettings = useBehavior(vm.openSettings$);
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const toggleAudio = useBehavior(vm.toggleAudio$);
  const toggleVideo = useBehavior(vm.toggleVideo$);
  const sharingScreen = useBehavior(vm.sharingScreen$);
  const toggleScreenSharing = useBehavior(vm.toggleScreenSharing$);
  const reactionIdentifier = useBehavior(vm.reactionIdentifier$);
  const reactionData = useBehavior(vm.reactionData$);
  const audioOutputSwitcher = useBehavior(vm.audioOutputSwitcher$);
  const hangup = useBehavior(vm.hangup$);
  const debugTileLayout = useBehavior(vm.debugTileLayout$);
  const tileStoreGeneration = useBehavior(vm.tileStoreGeneration$);
  const videoOptions = useBehavior(vm.videoOptions$);
  const selectedVideo = useBehavior(vm.selectedVideo$);
  const audioOptions = useBehavior(vm.audioOptions$);
  const selectedAudio = useBehavior(vm.selectedAudio$);
  const selectAudioButtonOption = useBehavior(vm.selectAudioButtonOption$);
  const selectVideoButtonOption = useBehavior(vm.selectVideoButtonOption$);
  const videoToggles = useBehavior(vm.videoToggles$);
  const buttonSize = useBehavior(vm.buttonSize$);
  const showSettingsButton = useBehavior(vm.showSettingsButton$);
  const showLogo = useBehavior(vm.showLogo$);

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
      data-testid="footer-container"
      className={classNames(styles.footer, {
        [styles.overlay]: asOverlay,
        [styles.hidden]: !showFooter,
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
