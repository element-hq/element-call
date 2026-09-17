/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type Ref, useCallback, useMemo } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";

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
import {
  type BackgroundEffectOption,
  MediaMuteAndSwitchButton,
  type MenuOptions,
} from "./MediaMuteAndSwitchButton";
import {
  serializeEffect,
  shippedBackgrounds,
} from "../livekit/backgroundEffects";
import {
  maxAddedBackgrounds,
  UnusableImage,
} from "../livekit/backgroundImages";
import { useAddedBackgrounds } from "../livekit/TrackProcessorContext";
import { type Behavior } from "../state/Behavior";
import { type ViewModel } from "../state/ViewModel";
import { useBehavior } from "../useBehavior";
import { type LayoutSwitchViewModel } from "../state/LayoutSwitchViewModel";
import { LayoutSwitch } from "../room/LayoutSwitch";

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
  toggleBlur: (() => void) | undefined;
  /** Undefined where background processing is unavailable. */
  selectBackgroundEffect: ((id: string) => void) | undefined;
  toggleScreenSharing: (() => void) | undefined;
  /** Also controls if the settings button is visible */
  openSettings: (() => void) | undefined;
  /** Also controls if the hangup button is visible */
  hangup: (() => void) | undefined;
}
// we do not use any ? optional properties so that the vm type is including all fields.
export interface FooterState {
  audioEnabled: boolean;
  audioBusy: boolean;
  videoEnabled: boolean;
  videoBusy: boolean;
  videoBlurEnabled: boolean;
  /** The chosen background effect, in its stored form. */
  backgroundEffect: string;
  showFooter: boolean;

  /* This is needed for WindowMode = "flat" */
  hideControls: boolean;
  /** The footer should be used as an overlay.
   * (Over the Call Grid) This saves spaces on small screens. */
  asOverlay: boolean;
  showModals: boolean;

  buttonSize: "md" | "lg";
  showLogo: boolean;

  /** Also controls if the layout switch is visible */
  layoutSwitchVm: LayoutSwitchViewModel | null;

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
  /** Output devices shown as their own section in the audio menu. */
  audioOutputOptions: MenuOptions[];
  /** Providing no options `[]` or `undefined` will imply that we dont have a audio fast switcher */
  videoOptions: MenuOptions[];
  selectedAudio: string | undefined;
  selectedAudioOutput: string | undefined;
  selectedVideo: string | undefined;
  selectAudioButtonOption: ((deviceId: string) => void) | undefined;
  selectAudioOutputOption: ((deviceId: string) => void) | undefined;
  selectVideoButtonOption: ((option: string) => void) | undefined;
}

export interface FooterProps {
  className?: string;
  ref?: Ref<HTMLDivElement>;
  children?: JSX.Element | JSX.Element[] | false;
  vm: ViewModel<FooterSnapshot>;
}
export const CallFooter: FC<FooterProps> = ({
  className,
  ref,
  children,
  vm,
}) => {
  const { t } = useTranslation();
  const asOverlay = useBehavior(vm.asOverlay$);
  const showFooter = useBehavior(vm.showFooter$);
  const hideControls = useBehavior(vm.hideControls$);
  const showModals = useBehavior(vm.showModals$);
  const layoutSwitchVm = useBehavior(vm.layoutSwitchVm$);
  const openSettings = useBehavior(vm.openSettings$);
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const audioBusy = useBehavior(vm.audioBusy$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const videoBusy = useBehavior(vm.videoBusy$);
  const toggleAudio = useBehavior(vm.toggleAudio$);
  const toggleVideo = useBehavior(vm.toggleVideo$);
  const sharingScreen = useBehavior(vm.sharingScreen$);
  const toggleScreenSharing = useBehavior(vm.toggleScreenSharing$);
  const reactionIdentifier = useBehavior(vm.reactionIdentifier$);
  const reactionData = useBehavior(vm.reactionData$);
  const audioOutputSwitcher = useBehavior(vm.audioOutputSwitcher$);
  const hangup = useBehavior(vm.hangup$);
  const debugTileLayout = useBehavior(vm.debugTileLayout$);
  const videoOptions = useBehavior(vm.videoOptions$);
  const selectedVideo = useBehavior(vm.selectedVideo$);
  const audioOptions = useBehavior(vm.audioOptions$);
  const selectedAudio = useBehavior(vm.selectedAudio$);
  const selectAudioButtonOption = useBehavior(vm.selectAudioButtonOption$);
  const audioOutputOptions = useBehavior(vm.audioOutputOptions$);
  const selectedAudioOutput = useBehavior(vm.selectedAudioOutput$);
  const selectAudioOutputOption = useBehavior(vm.selectAudioOutputOption$);
  const selectVideoButtonOption = useBehavior(vm.selectVideoButtonOption$);
  const backgroundEffect = useBehavior(vm.backgroundEffect$);
  const selectBackgroundEffect = useBehavior(vm.selectBackgroundEffect$);
  const { added, addBackground } = useAddedBackgrounds();

  const onAddBackgroundImage = useCallback(
    (file: File): void => {
      // Chosen for the user straight away: they picked this picture to use it,
      // and leaving it unselected would ask them to pick it twice.
      addBackground(file)
        .then((id) =>
          selectBackgroundEffect?.(serializeEffect({ kind: "added", id })),
        )
        .catch((e) => {
          // TODO: FR-021 wants the user told what went wrong. There is no
          // surface for that in the menu yet, and inventing one is design's
          // call, so for now this is only logged.
          logger.warn(
            e instanceof UnusableImage
              ? `Cannot use that file as a background: ${e.reason}`
              : "Could not keep that background",
            e,
          );
        });
    },
    [addBackground, selectBackgroundEffect],
  );

  // The catalogue is named here rather than in the view model: the names are
  // for reading, and a view model has no business holding translated text.
  const backgroundEffects = useMemo(
    (): BackgroundEffectOption[] => [
      { id: "none", kind: "none", label: t("action.background_effect_none") },
      { id: "blur", kind: "blur", label: t("action.background_effect_blur") },
      ...shippedBackgrounds.map((background, i) => ({
        id: serializeEffect({ kind: "shipped", id: background.id }),
        kind: "image" as const,
        // Numbered rather than named: the images are stand-ins, and naming
        // them here would invent names the design has not given them.
        label: t("action.background_effect_numbered", { n: i + 1 }),
        imageUrl: background.imagePath,
      })),
      ...added.map((background, i) => ({
        id: serializeEffect({ kind: "added", id: background.id }),
        kind: "image" as const,
        label: t("action.background_effect_numbered", {
          n: shippedBackgrounds.length + i + 1,
        }),
        imageUrl: background.url,
      })),
    ],
    [t, added],
  );
  const buttonSize = useBehavior(vm.buttonSize$);
  const showLogo = useBehavior(vm.showLogo$);

  const buttons: JSX.Element[] = [];

  if (openSettings !== undefined) {
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
        key="audio"
        iconsAndLabels="audio"
        enabled={audioEnabled ?? false}
        busy={audioBusy ?? false}
        onMuteClick={toggleAudio}
        data-testid="incall_mute"
        options={audioOptions}
        selectedOption={selectedAudio}
        onSelect={selectAudioButtonOption}
        outputOptions={audioOutputOptions}
        selectedOutputOption={selectedAudioOutput}
        onSelectOutput={selectAudioOutputOption}
      />,
    );
  } else {
    buttons.push(
      <MicButton
        size={buttonSize}
        key="audio"
        enabled={audioEnabled ?? false}
        busy={audioBusy ?? false}
        onClick={toggleAudio}
        disabled={(audioBusy ?? false) || toggleAudio === undefined}
        data-testid="incall_mute"
      />,
    );
  }

  if ((videoOptions?.length ?? 0) > 0) {
    buttons.push(
      <MediaMuteAndSwitchButton
        key="video"
        iconsAndLabels="video"
        enabled={videoEnabled ?? false}
        busy={videoBusy ?? false}
        onMuteClick={toggleVideo}
        options={videoOptions}
        selectedOption={selectedVideo}
        onSelect={selectVideoButtonOption}
        backgroundEffects={backgroundEffects}
        selectedBackgroundEffect={backgroundEffect}
        onSelectBackgroundEffect={selectBackgroundEffect}
        // Withheld once the device keeps as many as it will, which is what
        // renders the add tile unavailable rather than letting it fail.
        onAddBackgroundImage={
          selectBackgroundEffect && added.length < maxAddedBackgrounds
            ? onAddBackgroundImage
            : undefined
        }
      />,
    );
  } else {
    buttons.push(
      <VideoButton
        size={buttonSize}
        key="video"
        enabled={videoEnabled ?? false}
        busy={videoBusy ?? false}
        onClick={toggleVideo}
        disabled={(videoBusy ?? false) || toggleVideo === undefined}
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

  // Reaction button contains a pretty large menu, so treat it like a modal
  if (reactionIdentifier && reactionData && showModals) {
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
      {debugTileLayout ? (
        <TilesDebugInfo generation$={vm.tileStoreGeneration$} />
      ) : undefined}
    </div>
  );

  return (
    <div
      ref={ref}
      data-testid="footer-container"
      className={classNames(className, styles.footer, {
        [styles.overlay]: asOverlay,
        [styles.hidden]: !showFooter,
      })}
    >
      <div className={styles.settingsLogoContainer}>
        {openSettings !== undefined && (
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
      {!hideControls && layoutSwitchVm && (
        <LayoutSwitch vm={layoutSwitchVm} className={styles.layout} />
      )}
    </div>
  );
};

interface TilesDebugInfoProps {
  generation$: Behavior<number | undefined>;
}

// Isolated in its own component since the layout generation updates frequently
// and we can avoid re-rendering the footer this way
const TilesDebugInfo: FC<TilesDebugInfoProps> = ({ generation$ }) => {
  const generation = useBehavior(generation$);
  return `Tiles generation: ${generation}`;
};
