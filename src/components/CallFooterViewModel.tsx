/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, switchMap } from "rxjs";
import { supportsBackgroundProcessors } from "@livekit/track-processors";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type MenuOptions } from "./MediaMuteAndSwitchButton";
import { type MediaDevices } from "../state/MediaDevices";
import {
  backgroundBlur as backgroundBlurSettings,
  debugTileLayout as debugTileLayoutSetting,
} from "../settings/settings";
import { type Behavior, constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { createStaticViewModel, type ViewModel } from "../state/ViewModel";
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
  | "audioEnabled$"
  | "audioBusy$"
  | "toggleAudio$"
  | "videoEnabled$"
  | "videoBusy$"
  | "toggleVideo$"
> {
  return {
    audioEnabled$: muteStates.audio.enabled$,
    audioBusy$: muteStates.audio.syncing$,
    toggleAudio$: scope.behavior(
      muteStates.audio.toggle$.pipe(map((t) => t ?? undefined)),
    ),
    videoEnabled$: muteStates.video.enabled$,
    videoBusy$: muteStates.video.syncing$,
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
  | "toggleBlur$"
  | "videoBlurEnabled$"
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
                    label,
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
                    label,
                  })),
                ),
              ),
        ),
      ),
    ),
    selectedVideo$: scope.behavior(
      mediaDevices.videoInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectVideoButtonOption$: constant(mediaDevices.videoInput.select),
    toggleBlur$: scope.behavior(
      combineLatest([backgroundBlurSettings.value$, disableSwitcher$]).pipe(
        map(([current, switcherDisabled]) => {
          return !switcherDisabled && supportsBackgroundProcessors()
            ? (): void => {
                backgroundBlurSettings.setValue(!current);
              }
            : undefined;
        }),
      ),
    ),
    videoBlurEnabled$: backgroundBlurSettings.value$,
  };
}

/**
 * Creates the ViewModel for the CallFooter.
 *
 * @param scope - ObservableScope that bounds the lifetime of derived behaviors.
 * @param callModel - The root CallViewModel; provides layout, grid mode, reactions, etc.
 * @param muteStates - Audio and video mute state + toggles.
 * @param mediaDevices - Available and selected input devices.
 * @param reactionIdentifier - The local user's reaction identifier string, or
 *   undefined when reactions are not supported (hides the reaction button).
 */
export function createCallFooterViewModel(
  scope: ObservableScope,
  callModel: CallViewModel,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  reactionIdentifier: string | undefined,
): ViewModel<FooterSnapshot> {
  const { showControls, header: headerStyle } = getUrlParams();
  const showLogo = headerStyle === HeaderStyle.Standard;

  const isPip$ = scope.behavior(
    callModel.layout$.pipe(map((l) => l.type === "pip")),
  );
  const disableDeviceSwitcher$ = scope.behavior(
    isPip$.pipe(map((isPip) => isPip || platform !== "desktop")),
  );
  return {
    ...buildMuteBehaviors(scope, muteStates),
    ...buildDeviceBehaviors(scope, mediaDevices, disableDeviceSwitcher$),
    // candidat to move into the FooterViewModel
    showFooter$: callModel.showFooter$,
    hideControls$: constant(!showControls),
    asOverlay$: callModel.edgeToEdge$,
    buttonSize$: scope.behavior(
      isPip$.pipe(map<boolean, "md" | "lg">((pip) => (pip ? "md" : "lg"))),
    ),

    openSettings$: scope.behavior(
      combineLatest([
        isPip$,
        callModel.showHeader$,
        callModel.setSettingsOpen$,
      ]).pipe(
        map(([isPip, showHeader, setSettingsOpen]) =>
          !isPip && headerStyle !== HeaderStyle.AppBar && showControls
            ? (): void => setSettingsOpen(true)
            : undefined,
        ),
      ),
    ),

    showLogo$: scope.behavior(isPip$.pipe(map((isPip) => showLogo && !isPip))),

    layoutMode$: callModel.gridMode$,
    setLayoutMode$: scope.behavior(
      isPip$.pipe(
        map((isPip) =>
          !isPip && showControls ? callModel.setGridMode : undefined,
        ),
      ),
    ),

    sharingScreen$: callModel.sharingScreen$,
    toggleScreenSharing$: constant(callModel.toggleScreenSharing ?? undefined),

    audioOutputSwitcher$: scope.behavior(
      callModel.audioOutputSwitcher$.pipe(
        map((switcher) => switcher ?? undefined),
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
    ...createStaticViewModel({
      // we can safly skip any props that we do not need.
      // The view model will then have less keys.
      // But as soon as we call `useViewModel` and convert back to a snapshot the missing props will
      // be correcty matching the snapshot type.
      showLogo,
      hideControls: false,
      asOverlay: false,
      buttonSize: "lg",
      showLayoutSwitcher: false,
      openSettings,
      hangup,
      debugTileLayout: false,
      showFooter: true,
      toggleAudio: undefined,
      toggleVideo: undefined,
      setLayoutMode: undefined,
      toggleScreenSharing: undefined,
      audioEnabled: undefined,
      audioBusy: false,
      videoEnabled: undefined,
      videoBusy: false,
      layoutMode: undefined,
      sharingScreen: false,
      audioOutputSwitcher: undefined,
      reactionIdentifier: undefined,
      reactionData: undefined,
      tileStoreGeneration: undefined,
      audioOptions: undefined,
      videoOptions: undefined,
      selectedAudio: undefined,
      selectedVideo: undefined,
      selectAudioButtonOption: undefined,
      selectVideoButtonOption: undefined,
    }),
    ...buildMuteBehaviors(scope, muteStates),
    ...buildDeviceBehaviors(scope, mediaDevices, constant(false)),
  };
}
