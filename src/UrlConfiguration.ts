/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How Element Call can be told to behave, and what each intent means.
 *
 * Kept apart from {@link UrlParams} on purpose: everything here is constants,
 * types and one function of them, so that a host of the component can import
 * these — the enums it needs as values, the defaults an intent implies — without
 * loading Element Call itself. UrlParams, which reads them from a URL, needs
 * the router, the config and the rest of the app; this module must not.
 * `component/api.ts` is built from it as an entry point of its own.
 */

import {
  type RTCCallIntent,
  type RTCNotificationType,
} from "matrix-js-sdk/lib/matrixrtc";

import { platform } from "./Platform";

export enum UserIntent {
  StartNewCall = "start_call",
  JoinExistingCall = "join_existing",
  StartNewCallVoice = "start_call_voice",
  JoinExistingCallVoice = "join_existing_voice",
  StartNewCallDM = "start_call_dm",
  StartNewCallDMVoice = "start_call_dm_voice",
  JoinExistingCallDM = "join_existing_dm",
  JoinExistingCallDMVoice = "join_existing_dm_voice",
  Unknown = "unknown",
}

export enum HeaderStyle {
  None = "none",
  Standard = "standard",
  AppBar = "app_bar",
}

export enum BackgroundStyle {
  Solid = "solid",
  Gradient = "gradient",
}

/**
 * The configuration for the app, which can be set via URL parameters.
 * Those property are different to the UrlProperties, since they are all optional
 * and configure the behavior of the app. Their value is the same if EC is used in
 * the same context but with different accounts/users.
 *
 * Their defaults can be controlled by the `intent` property.
 */
export interface UrlConfiguration {
  /**
   * Whether the app should keep the user confined to the current call/room.
   */
  confineToRoom: boolean;
  /**
   * Whether the app should pause before joining the call until it sees an
   * io.element.join widget action, allowing it to be preloaded.
   */
  preload: boolean;
  /**
   * The style of headers to show. "standard" is the default arrangement, "none"
   * hides the header entirely, and "app_bar" produces a header with a back
   * button like you might see in mobile apps. The callback for the back button
   * is window.controls.onBackButtonPressed.
   */
  header: HeaderStyle;
  /**
   * Whether the controls should be shown. For screen recording no controls can be desired.
   */
  showControls: boolean;
  /**
   * Whether to hide the screen-sharing button.
   */
  hideScreensharing: boolean;

  /**
   * Whether the app is allowed to use fallback STUN servers for ICE in case the
   * user's homeserver doesn't provide any.
   */
  allowIceFallback: boolean;

  /**
   * Whether the app should use per participant keys for E2EE.
   */
  perParticipantE2EE: boolean;
  /**
   * Whether the global JS controls for audio output devices should be enabled,
   * allowing the list of output devices to be controlled by the app hosting
   * Element Call.
   */
  controlledAudioDevices: boolean;
  /**
   * Setting this flag skips the lobby and brings you in the call directly.
   * In the widget this can be combined with preload to pass the device settings
   * with the join widget action.
   */
  skipLobby: boolean;
  /**
   * Setting this flag makes element call show the lobby after leaving a call.
   * This is useful for video rooms.
   */
  returnToLobby: boolean;
  /**
   * Whether and what type of notification EC should send, when the user joins the call.
   */
  sendNotificationType?: RTCNotificationType;
  /**
   * Whether the app should automatically leave the call when there
   * is no one left in the call.
   * This is one part to make the call matrixRTC session behave like a telephone call.
   */
  autoLeaveWhenOthersLeft: boolean;

  /**
   * If the client should behave like it is awaiting an answer if a notification was sent (wait for call pick up).
   * This is a no-op if not combined with sendNotificationType.
   *
   * This entails:
   *  - show ui that it is awaiting an answer
   *  - play a sound that indicates that it is awaiting an answer
   *  - auto-dismiss the call widget once the notification lifetime expires on the receivers side.
   */
  waitForCallPickup: boolean;

  /**
   * Whether to enable echo cancellation for audio capture.
   * Defaults to true.
   */
  echoCancellation?: boolean;
  /**
   * Whether to enable noise suppression for audio capture.
   * Defaults to true.
   */
  noiseSuppression?: boolean;

  callIntent?: RTCCallIntent;
}

// If you need to add a new flag to this interface, prefer a name that describes
// a specific behavior (such as 'confineToRoom'), rather than one that describes
// the situations that call for this behavior ('isEmbedded'). This makes it
// clearer what each flag means, and helps us avoid coupling Element Call's
// behavior to the needs of specific consumers.

/**
 * The configuration implied by what the user meant to do — if they pressed a
 * Start Call button this would be `start_call`, and if they pressed Join Call,
 * `join_existing`.
 *
 * These are platform-specific defaults, so that a host can start a call by
 * saying what the user asked for rather than by setting every parameter itself,
 * and so that what each intent means is Element Call's decision, made in one
 * place. A host that wants something else states it alongside the intent.
 *
 * {@link UserIntent.Unknown} means no intent was stated, and gives the
 * standalone app's defaults: Element Call owns the whole page, so it offers the
 * way out of the room that a hosted call must not.
 */
export function configurationForIntent(intent: UserIntent): UrlConfiguration {
  // Only constants and `platform` here, so that this depends on nothing but
  // the intent.
  let preset: UrlConfiguration = {
    confineToRoom: true,
    preload: false,
    header: platform === "desktop" ? HeaderStyle.None : HeaderStyle.AppBar,
    showControls: true,
    hideScreensharing: false,
    allowIceFallback: true,
    perParticipantE2EE: true,
    controlledAudioDevices: platform === "desktop" ? false : true,
    skipLobby: true,
    returnToLobby: false,
    sendNotificationType: "notification",
    autoLeaveWhenOthersLeft: false,
    waitForCallPickup: false,
  };
  switch (intent) {
    case UserIntent.StartNewCall:
      preset.skipLobby = false;
      preset.callIntent = "video";
      break;
    case UserIntent.JoinExistingCall:
      // On desktop this will be overridden based on which button was used to join the call
      preset.skipLobby = false;
      preset.callIntent = "video";
      break;
    case UserIntent.StartNewCallVoice:
      preset.skipLobby = false;
      preset.callIntent = "audio";
      break;
    case UserIntent.JoinExistingCallVoice:
      // On desktop this will be overridden based on which button was used to join the call
      preset.skipLobby = false;
      preset.callIntent = "audio";
      break;
    case UserIntent.StartNewCallDMVoice:
      preset.callIntent = "audio";
    // Fall through
    case UserIntent.StartNewCallDM:
      preset.skipLobby = true;
      preset.sendNotificationType = "ring";
      preset.autoLeaveWhenOthersLeft = true;
      preset.waitForCallPickup = true;
      preset.callIntent = preset.callIntent ?? "video";
      break;
    case UserIntent.JoinExistingCallDMVoice:
      preset.callIntent = "audio";
    // Fall through
    case UserIntent.JoinExistingCallDM:
      // On desktop this will be overridden based on which button was used to join the call
      preset.skipLobby = true;
      preset.autoLeaveWhenOthersLeft = true;
      preset.callIntent = preset.callIntent ?? "video";
      break;
    // Non widget usecase defaults
    default:
      preset = {
        confineToRoom: false,
        preload: false,
        header: HeaderStyle.Standard,
        showControls: true,
        hideScreensharing: false,
        allowIceFallback: false,
        perParticipantE2EE: false,
        controlledAudioDevices: false,
        skipLobby: false,
        returnToLobby: false,
        sendNotificationType: undefined,
        autoLeaveWhenOthersLeft: false,
        waitForCallPickup: false,
      };
  }
  return preset;
}
