/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, type Observable, switchMap } from "rxjs";
import { supportsAudioOutputSelection } from "livekit-client";

import { supportsBackgroundProcessors } from "../livekit/backgroundProcessing";
import {
  parseEffect,
  serializeEffect,
  shippedBackgrounds,
} from "../livekit/backgroundEffects";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type MenuOptions } from "./MediaMuteAndSwitchButton";
import { type MediaDevices } from "../state/MediaDevices";
import {
  backgroundEffect as backgroundEffectSetting,
  debugTileLayout as debugTileLayoutSetting,
} from "../settings/settings";
import { type Behavior, constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { createStaticViewModel, type ViewModel } from "../state/ViewModel";
import { HeaderStyle } from "../UrlParams";
import { platform } from "../Platform";
import { type BackgroundEffectChoice, type FooterSnapshot } from "./CallFooter";

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
 * needed by FooterSnapshot (options, selection, callbacks, background effect).
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
  | "audioOutputOptions$"
  | "selectedAudioOutput$"
  | "selectAudioOutputOption$"
  | "videoOptions$"
  | "selectedVideo$"
  | "selectVideoButtonOption$"
  | "backgroundEffect$"
  | "selectBackgroundEffect$"
  | "backgroundEffects$"
  | "backgroundEffectNotice$"
> {
  const options$ = (
    available$: Behavior<Map<string, MenuOptions["label"]>>,
  ): Observable<MenuOptions[]> =>
    disableSwitcher$.pipe(
      switchMap((disable) =>
        disable
          ? constant([] as MenuOptions[])
          : available$.pipe(
              map((available) =>
                [...available.entries()].map(([id, label]) => ({ id, label })),
              ),
            ),
      ),
    );

  const supported = supportsBackgroundProcessors();
  const offered$ = disableSwitcher$.pipe(
    map((switcherDisabled) => !switcherDisabled && supported),
  );
  return {
    audioOptions$: scope.behavior(options$(mediaDevices.audioInput.available$)),
    selectedAudio$: scope.behavior(
      mediaDevices.audioInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectAudioButtonOption$: constant(mediaDevices.audioInput.select),
    audioOutputOptions$: scope.behavior(
      options$(mediaDevices.audioOutput.available$),
    ),
    selectedAudioOutput$: scope.behavior(
      mediaDevices.audioOutput.selected$.pipe(map((s) => s?.id)),
    ),
    // Withheld where the platform can't route audio to a chosen device, which
    // disables the speaker section.
    selectAudioOutputOption$: constant(
      supportsAudioOutputSelection()
        ? mediaDevices.audioOutput.select
        : undefined,
    ),
    videoOptions$: scope.behavior(options$(mediaDevices.videoInput.available$)),
    selectedVideo$: scope.behavior(
      mediaDevices.videoInput.selected$.pipe(map((s) => s?.id)),
    ),
    selectVideoButtonOption$: constant(mediaDevices.videoInput.select),
    backgroundEffect$: scope.behavior(
      backgroundEffectSetting.value$.pipe(
        map((raw) => (supported ? serializeEffect(parseEffect(raw)) : "none")),
      ),
    ),
    selectBackgroundEffect$: scope.behavior(
      offered$.pipe(
        map((offered) =>
          offered
            ? (id: string): void =>
                backgroundEffectSetting.setValue(
                  serializeEffect(parseEffect(id)),
                )
            : undefined,
        ),
      ),
    ),
    backgroundEffects$: constant(backgroundEffectChoices()),
    backgroundEffectNotice$: scope.behavior(
      offered$.pipe(map((offered) => (offered ? undefined : "unavailable"))),
    ),
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
 * @param options - `showControls`: whether the call controls should be shown.
 *   `header`: the style of header, which decides whether to show the logo.
 */
export function createCallFooterViewModel(
  scope: ObservableScope,
  callModel: CallViewModel,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  reactionIdentifier: string | undefined,
  options: { showControls: boolean; header: HeaderStyle },
): ViewModel<FooterSnapshot> {
  const { showControls, header: headerStyle } = options;
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
    showModals$: callModel.showModals$,
    asOverlay$: callModel.edgeToEdge$,
    buttonSize$: scope.behavior(
      isPip$.pipe(map<boolean, "md" | "lg">((pip) => (pip ? "md" : "lg"))),
    ),

    openSettings$: scope.behavior(
      combineLatest([
        callModel.showModals$,
        callModel.showHeader$,
        callModel.setSettingsOpen$,
      ]).pipe(
        map(([showModals, showHeader, setSettingsOpen]) =>
          showModals && headerStyle !== HeaderStyle.AppBar && showControls
            ? (): void => setSettingsOpen(true)
            : undefined,
        ),
      ),
    ),

    showLogo$: scope.behavior(isPip$.pipe(map((isPip) => showLogo && !isPip))),

    layoutSwitchVm$: callModel.layoutSwitchVm$,

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
      showModals: true,
      buttonSize: "lg",
      openSettings,
      hangup,
      debugTileLayout: false,
      showFooter: true,
      toggleAudio: undefined,
      toggleVideo: undefined,
      toggleScreenSharing: undefined,
      audioEnabled: undefined,
      audioBusy: false,
      videoEnabled: undefined,
      videoBusy: false,
      layoutSwitchVm: null,
      sharingScreen: false,
      audioOutputSwitcher: undefined,
      reactionIdentifier: undefined,
      reactionData: undefined,
      tileStoreGeneration: undefined,
      audioOptions: undefined,
      audioOutputOptions: undefined,
      videoOptions: undefined,
      selectedAudio: undefined,
      selectedAudioOutput: undefined,
      selectedVideo: undefined,
      selectAudioButtonOption: undefined,
      selectAudioOutputOption: undefined,
      selectVideoButtonOption: undefined,
    }),
    ...buildMuteBehaviors(scope, muteStates),
    ...buildDeviceBehaviors(scope, mediaDevices, constant(false)),
  };
}

function backgroundEffectChoices(): BackgroundEffectChoice[] {
  return [
    { id: serializeEffect({ kind: "none" }), kind: "none" },
    { id: serializeEffect({ kind: "blur" }), kind: "blur" },
    ...shippedBackgrounds.map((background) => ({
      id: serializeEffect({ kind: "shipped", id: background.id }),
      kind: "image" as const,
      imageUrl: background.imagePath,
    })),
  ];
}
