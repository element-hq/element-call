/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, switchMap } from "rxjs";
import { supportsBackgroundProcessors } from "@livekit/track-processors";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import {
  type MenuOptions,
  type ToggleOption,
} from "./MediaMuteAndSwitchButton";
import { type MediaDevices } from "../state/MediaDevices";
import { mediaDeviceLabelToString } from "../settings/DeviceSelection";
import {
  backgroundBlur as backgroundBlurSettings,
  debugTileLayout as debugTileLayoutSetting,
} from "../settings/settings";
import { type Behavior, constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { type ViewModel } from "../state/ViewModel";
import { getUrlParams, HeaderStyle } from "../UrlParams";
import { platform } from "../Platform";
import { type FooterSnapshot } from "./CallFooter";

/**
 * Shared helper: maps MuteStates into the audio/video enabled + toggle behaviors
 * needed by FooterSnapshot.
 */
function buildMuteBehaviors(
  scope: ObservableScope,
  muteStates: MuteStates,
): Pick<
  ViewModel<FooterSnapshot>,
  "audioEnabled$" | "toggleAudio$" | "videoEnabled$" | "toggleVideo$"
> {
  return {
    audioEnabled$: muteStates.audio.enabled$,
    toggleAudio$: scope.behavior(
      muteStates.audio.toggle$.pipe(map((t) => t ?? undefined)),
    ),
    videoEnabled$: muteStates.video.enabled$,
    toggleVideo$: scope.behavior(
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
  /** return empty arrays for  audioOptions and videoOptions*/
  disableSwitcher$: Behavior<boolean>,
): Pick<
  ViewModel<FooterSnapshot>,
  | "audioOptions$"
  | "selectedAudio$"
  | "selectAudioButtonOption$"
  | "videoOptions$"
  | "selectedVideo$"
  | "selectVideoButtonOption$"
  | "videoToggles$"
> {
  return {
    audioOptions$: scope.behavior(
      disableSwitcher$.pipe(
        switchMap((disable) =>
          disable
            ? constant([] as MenuOptions[])
            : mediaDevices.audioInput.available$.pipe(
                map((available) =>
                  [...available.entries()].map(([id, label]) => ({
                    id,
                    label: mediaDeviceLabelToString(
                      label,
                      (n) => "Audio Device " + n,
                    ),
                  })),
                ),
              ),
        ),
      ),
    ),
    selectedAudio$: scope.behavior(
      mediaDevices.audioInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectAudioButtonOption$: constant(mediaDevices.audioInput.select),
    videoOptions$: scope.behavior(
      disableSwitcher$.pipe(
        switchMap((disable) =>
          disable
            ? constant([] as MenuOptions[])
            : mediaDevices.videoInput.available$.pipe(
                map((available) =>
                  [...available.entries()].map(([id, label]) => ({
                    id,
                    label: mediaDeviceLabelToString(
                      label,
                      (n) => "Camera " + n,
                    ),
                  })),
                ),
              ),
        ),
      ),
    ),
    selectedVideo$: scope.behavior(
      mediaDevices.videoInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectVideoButtonOption$: scope.behavior(
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
    videoToggles$: scope.behavior(
      disableSwitcher$.pipe(
        switchMap((disable) =>
          disable
            ? constant([] as ToggleOption[])
            : backgroundBlurSettings.value$.pipe(
                map((blurActive) =>
                  supportsBackgroundProcessors()
                    ? [
                        {
                          id: "blur",
                          enabled: blurActive,
                          label: "Blur Background",
                        },
                      ]
                    : [],
                ),
              ),
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
  const isPip$ = scope.behavior(
    callModel.layout$.pipe(map((l) => l.type === "pip")),
  );
  const disableDeviceSwitcher$ = scope.behavior(
    isPip$.pipe(map((isPip) => isPip || platform !== "desktop")),
  );
  return {
    ...buildMuteBehaviors(scope, muteStates),
    ...buildDeviceBehaviors(scope, mediaDevices, disableDeviceSwitcher$),

    hideControls$: constant(!showControls),
    asOverlay$: scope.behavior(
      callModel.windowMode$.pipe(map((mode) => mode === "flat")),
    ),
    buttonSize$: scope.behavior(
      isPip$.pipe(map((pip) => (pip ? "md" : "lg") as "md" | "lg")),
    ),
    showSettingsButton$: scope.behavior(
      combineLatest([isPip$, callModel.showHeader$]).pipe(
        map(
          ([isPip, showHeader]) =>
            openSettings !== undefined &&
            !isPip &&
            showControls &&
            !(headerStyle === HeaderStyle.AppBar && showHeader),
        ),
      ),
    ),
    showLayoutSwitcher$: scope.behavior(
      isPip$.pipe(map((l) => !isPip$ && showControls)),
    ),
    showLogoDebugContainer$: scope.behavior(
      combineLatest([isPip$, debugTileLayoutSetting.value$]).pipe(
        map(([isPip, debugTile]) => !isPip || (!hideLogo && !debugTile)),
      ),
    ),
    showLogo$: scope.behavior(isPip$.pipe(map((l) => !hideLogo && !isPip$))),

    layoutMode$: callModel.gridMode$,
    setLayoutMode$: constant(callModel.setGridMode),

    sharingScreen$: callModel.sharingScreen$,
    toggleScreenSharing$: constant(callModel.toggleScreenSharing ?? undefined),

    audioOutputSwitcher$: scope.behavior(
      callModel.audioOutputSwitcher$.pipe(
        map((switcher) => switcher ?? undefined),
      ),
    ),

    openSettings$: scope.behavior(
      callModel.showHeader$.pipe(
        map((showHeader) =>
          headerStyle === HeaderStyle.AppBar && showHeader
            ? undefined
            : openSettings,
        ),
      ),
    ),
    hangup$: constant(callModel.hangup),

    reactionIdentifier$: constant(reactionIdentifier),
    reactionData$: constant(
      reactionIdentifier !== undefined
        ? {
            handsRaised$: callModel.handsRaised$,
            reactions$: callModel.reactions$,
          }
        : undefined,
    ),

    debugTileLayout$: debugTileLayoutSetting.value$,
    tileStoreGeneration$: callModel.tileStoreGeneration$,
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
    ...buildDeviceBehaviors(scope, mediaDevices, constant(false)),
    hideControls$: constant(false),
    asOverlay$: constant(false),
    buttonSize$: constant("lg"),
    showSettingsButton$: constant(openSettings !== undefined),
    showLayoutSwitcher$: constant(false),
    showLogoDebugContainer$: constant(showLogo),
    showLogo$: constant(showLogo),

    layoutMode$: constant(undefined),
    setLayoutMode$: constant(undefined),

    sharingScreen$: constant(undefined),
    toggleScreenSharing$: constant(undefined),

    audioOutputSwitcher$: constant(undefined),

    openSettings$: constant(openSettings),
    hangup$: constant(hangup),

    reactionIdentifier$: constant(undefined),
    reactionData$: constant(undefined),

    debugTileLayout$: constant(false),
    tileStoreGeneration$: constant(0),
  };
}
