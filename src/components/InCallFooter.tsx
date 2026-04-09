/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type Ref, useMemo } from "react";
import classNames from "classnames";

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
} from "../button";
import styles from "../room/InCallView.module.css";
import { LayoutToggle } from "../room/LayoutToggle";
import {
  type CallViewModel,
  type GridMode,
} from "../state/CallViewModel/CallViewModel";
import { useAppBarSecondaryButton } from "../AppBar";

export interface AudioOutputSwitcher {
  targetOutput: string;
  switch: () => void;
}

export interface InCallFooterProps {
  ref?: Ref<HTMLDivElement>;
  /* This is needed for WindowMode = "flat" */
  asOverlay: boolean;
  showFooter: boolean;
  showControls: boolean;
  showSettingsButton: boolean;
  showLogo: boolean;
  asPip: boolean;
  gridMode: GridMode;
  setGridMode: (mode: GridMode) => void;
  openSettings: () => void;
  audioEnabled: boolean;
  videoEnabled: boolean;
  toggleAudio?: () => void;
  toggleVideo?: () => void;
  sharingScreen: boolean;
  toggleScreenSharing?: () => void;
  supportsReactions: boolean;
  reactionIdentifier: string;
  reactionData: Pick<CallViewModel, "handsRaised$" | "reactions$">;
  audioOutputSwitcher: AudioOutputSwitcher | null;
  hangup: () => void;
  debugTileLayout: boolean;
  tileStoreGeneration: number;
}

export const InCallFooter: FC<InCallFooterProps> = ({
  ref,
  asOverlay,
  showFooter,
  showControls,
  showSettingsButton,
  showLogo,
  asPip,
  gridMode,
  setGridMode,
  openSettings,
  audioEnabled,
  videoEnabled,
  toggleAudio,
  toggleVideo,
  sharingScreen,
  toggleScreenSharing,
  supportsReactions,
  reactionIdentifier,
  reactionData,
  audioOutputSwitcher,
  hangup,
  debugTileLayout,
  tileStoreGeneration,
}) => {
  const buttons: JSX.Element[] = [];
  const buttonSize = asPip ? "sm" : "lg";

  buttons.push(
    <MicButton
      size={buttonSize}
      key="audio"
      enabled={audioEnabled}
      onClick={toggleAudio ?? undefined}
      disabled={toggleAudio === null}
      data-testid="incall_mute"
    />,
    <VideoButton
      size={buttonSize}
      key="video"
      enabled={videoEnabled}
      onClick={toggleVideo ?? undefined}
      disabled={toggleVideo === null}
      data-testid="incall_videomute"
    />,
  );

  if (toggleScreenSharing !== null) {
    buttons.push(
      <ShareScreenButton
        size={buttonSize}
        key="share_screen"
        className={styles.shareScreen}
        enabled={sharingScreen}
        onClick={toggleScreenSharing}
        data-testid="incall_screenshare"
      />,
    );
  }

  if (supportsReactions) {
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
    if (audioOutputSwitcher === null) return null;
    return (
      <LoudspeakerButton
        size={buttonSize}
        isEarpieceTarget={audioOutputSwitcher.targetOutput === "earpiece"}
      />
    );
  }, [audioOutputSwitcher, buttonSize]);

  if (audioOutputButton) buttons.push(audioOutputButton);

  useAppBarSecondaryButton(
    <SettingsButton key="settings" onClick={openSettings} />,
  );

  buttons.push(
    <EndCallButton
      size={buttonSize}
      key="end_call"
      onClick={hangup}
      data-testid="incall_leave"
    />,
  );

  const logo = (
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
        [styles.hidden]: !showFooter,
      })}
    >
      <div className={styles.settingsLogoContainer}>
        {showControls && showSettingsButton && !asPip && (
          <SettingsButton key="settings" onClick={openSettings} />
        )}

        {(!asPip || (!showLogo && !debugTileLayout)) && logo}
      </div>

      {showControls && <div className={styles.buttons}>{buttons}</div>}
      {showControls && !asPip && (
        <LayoutToggle
          className={styles.layout}
          layout={gridMode}
          setLayout={setGridMode}
        />
      )}
    </div>
  );
};
