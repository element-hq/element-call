/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type RTCCallIntent,
  type RTCNotificationType,
} from "matrix-js-sdk/lib/matrixrtc";
import { pickBy } from "lodash-es";

import { Config } from "./config/Config";
import { type EncryptionSystem } from "./e2ee/sharedKeyManagement";
import { E2eeType } from "./e2ee/e2eeType";
import { platform } from "./Platform";

interface RoomIdentifier {
  roomAlias: string | null;
  roomId: string | null;
  viaServers: string[];
}

export enum UserIntent {
  StartNewCall = "start_call",
  JoinExistingCall = "join_existing",
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

/**
 * The UrlProperties are used to pass required data to the widget.
 * Those are different in different rooms, users, devices. They do not configure the behavior of the
 * widget but provide the required data to the widget.
 */
export interface UrlProperties {
  // Widget api related params
  widgetId: string | null;
  parentUrl: string | null;
  /**
   * Anything about what room we're pointed to should be from useRoomIdentifier which
   * parses the path and resolves alias with respect to the default server name, however
   * roomId is an exception as we need the room ID in embedded (matroyska) mode, and not
   * the room alias (or even the via params because we are not trying to join it). This
   * is also not validated, where it is in useRoomIdentifier().
   */
  roomId: string | null;
  /**
   * The user's ID (only used in matryoshka mode).
   */
  userId: string | null;

  /**
   * The display name to use for auto-registration.
   */
  displayName: string | null;
  /**
   * The device's ID (only used in matryoshka mode).
   */
  deviceId: string | null;
  /**
   * The base URL of the homeserver to use for media lookups in matryoshka mode.
   */
  baseUrl: string | null;
  /**
   * The BCP 47 code of the language the app should use.
   */
  lang: string | null;
  /**
   * The fonts which the interface should use, if not empty.
   */
  fonts: string[];
  /**
   * The factor by which to scale the interface's font size.
   */
  fontScale: number | null;
  /**
   * The Posthog analytics ID. It is only available if the user has given consent for sharing telemetry in element web.
   */
  posthogUserId: string | null;
  /**
   * The Posthog API host. This is only used in the embedded package of Element Call.
   */
  posthogApiHost: string | null;
  /**
   * The Posthog API key. This is only used in the embedded package of Element Call.
   */
  posthogApiKey: string | null;
  /**
   * Whether to use end-to-end encryption.
   */
  e2eEnabled: boolean;
  /**
   * E2EE password
   */
  password: string | null;
  /** This defines the homeserver that is going to be used when joining a room.
   * It has to be set to a non default value for links to rooms
   * that are not on the default homeserver,
   * that is in use for the current user.
   */
  viaServers: string | null;

  /**
   * This defines the homeserver that is going to be used when registering
   * a new (guest) user.
   * This can be user to configure a non default guest user server when
   * creating a spa link.
   */
  homeserver: string | null;

  /**
   * The rageshake submit URL. This is only used in the embedded package of Element Call.
   */
  rageshakeSubmitUrl: string | null;

  /**
   * The Sentry DSN. This is only used in the embedded package of Element Call.
   */
  sentryDsn: string | null;

  /**
   * The Sentry environment. This is only used in the embedded package of Element Call.
   */
  sentryEnvironment: string | null;
  /**
   * The theme to use for element call.
   * can be "light", "dark", "light-high-contrast" or "dark-high-contrast".
   */
  theme: string | null;
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
   * Whether upon entering a room, the user should be prompted to launch the
   * native mobile app. (Affects only Android and iOS.)
   *
   * The app prompt must also be enabled in the config for this to take effect.
   */
  appPrompt: boolean;
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

  callIntent?: RTCCallIntent;
}
interface IntentAndPlatformDerivedConfiguration {
  defaultAudioEnabled?: boolean;
  defaultVideoEnabled?: boolean;
}
interface IntentAndPlatformDerivedConfiguration {
  defaultAudioEnabled?: boolean;
  defaultVideoEnabled?: boolean;
}

// If you need to add a new flag to this interface, prefer a name that describes
// a specific behavior (such as 'confineToRoom'), rather than one that describes
// the situations that call for this behavior ('isEmbedded'). This makes it
// clearer what each flag means, and helps us avoid coupling Element Call's
// behavior to the needs of specific consumers.
export interface UrlParams
  extends UrlProperties,
    UrlConfiguration,
    IntentAndPlatformDerivedConfiguration {}

// This is here as a stopgap, but what would be far nicer is a function that
// takes a UrlParams and returns a query string. That would enable us to
// consolidate all the data about URL parameters and their meanings to this one
// file.
export function editFragmentQuery(
  hash: string,
  edit: (params: URLSearchParams) => URLSearchParams,
): string {
  const fragmentQueryStart = hash.indexOf("?");
  const fragmentParams = edit(
    new URLSearchParams(
      fragmentQueryStart === -1 ? "" : hash.substring(fragmentQueryStart),
    ),
  );
  return `${hash.substring(
    0,
    fragmentQueryStart,
  )}?${fragmentParams.toString()}`;
}

class ParamParser {
  private fragmentParams: URLSearchParams;
  private queryParams: URLSearchParams;

  public constructor(search: string, hash: string) {
    this.queryParams = new URLSearchParams(search);

    const fragmentQueryStart = hash.indexOf("?");
    this.fragmentParams = new URLSearchParams(
      fragmentQueryStart === -1 ? "" : hash.substring(fragmentQueryStart),
    );
  }

  // Normally, URL params should be encoded in the fragment so as to avoid
  // leaking them to the server. However, we also check the normal query
  // string for backwards compatibility with versions that only used that.
  public getParam(name: string): string | null {
    return this.fragmentParams.get(name) ?? this.queryParams.get(name);
  }

  public getEnumParam<T extends string>(
    name: string,
    type: { [s: string]: T } | ArrayLike<T>,
  ): T | undefined {
    const value = this.getParam(name);
    if (value !== null && Object.values(type).includes(value as T)) {
      return value as T;
    }
    return undefined;
  }

  public getAllParams(name: string): string[] {
    return [
      ...this.fragmentParams.getAll(name),
      ...this.queryParams.getAll(name),
    ];
  }

  /**
   * Returns true if the flag exists and is not "false".
   */
  public getFlagParam(name: string, defaultValue = false): boolean {
    const param = this.getParam(name);
    return param === null ? defaultValue : param !== "false";
  }
  /**
   * Returns the value of the flag if it exists, or undefined if it does not.
   */
  public getFlag(name: string): boolean | undefined {
    const param = this.getParam(name);
    return param !== null ? param !== "false" : undefined;
  }
}

let urlParamCache: {
  search?: string;
  hash?: string;
  params?: UrlParams;
} = {};

/**
 * Gets the url params and loads them from a cache if already computed.
 * @param search The URL search string
 * @param hash The URL hash
 * @returns The app parameters encoded in the URL
 */
export const getUrlParams = (
  search = window.location.search,
  hash = window.location.hash,
): UrlParams => {
  if (
    urlParamCache.search === search &&
    urlParamCache.hash === hash &&
    urlParamCache.params
  ) {
    return urlParamCache.params;
  }
  const params = computeUrlParams(search, hash);
  urlParamCache = { search, hash, params };

  return params;
};

/**
 * Gets the app parameters for the current URL.
 * @param search The URL search string
 * @param hash The URL hash
 * @returns The app parameters encoded in the URL
 */
export const computeUrlParams = (search = "", hash = ""): UrlParams => {
  const parser = new ParamParser(search, hash);

  const fontScale = parseFloat(parser.getParam("fontScale") ?? "");

  const widgetId = parser.getParam("widgetId");
  const parentUrl = parser.getParam("parentUrl");
  const isWidget = !!widgetId && !!parentUrl;

  /**
   * The user's intent with respect to the call.
   * e.g. if they clicked a Start Call button, this would be `start_call`.
   * If it was a Join Call button, it would be `join_existing`.
   * This is a platform specific default set of parameters, that allows to minize the configuration
   * needed to start a call. And empowers the EC codebase to control the platform/intent behavior in
   * a central place.
   *
   * In short: either provide url query parameters of UrlConfiguration or set the intent
   * (or the global defaults will be used).
   */
  const intent = !isWidget
    ? UserIntent.Unknown
    : (parser.getEnumParam("intent", UserIntent) ?? UserIntent.Unknown);
  // Here we only use constants and `platform` to determine the intent preset.
  let intentPreset: UrlConfiguration = {
    confineToRoom: true,
    appPrompt: false,
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
      intentPreset.skipLobby = false;
      intentPreset.callIntent = "video";
      break;
    case UserIntent.JoinExistingCall:
      // On desktop this will be overridden based on which button was used to join the call
      intentPreset.skipLobby = false;
      intentPreset.callIntent = "video";
      break;
    case UserIntent.StartNewCallDMVoice:
      intentPreset.callIntent = "audio";
    // Fall through
    case UserIntent.StartNewCallDM:
      intentPreset.skipLobby = true;
      intentPreset.sendNotificationType = "ring";
      intentPreset.autoLeaveWhenOthersLeft = true;
      intentPreset.waitForCallPickup = true;
      intentPreset.callIntent = intentPreset.callIntent ?? "video";
      break;
    case UserIntent.JoinExistingCallDMVoice:
      intentPreset.callIntent = "audio";
    // Fall through
    case UserIntent.JoinExistingCallDM:
      // On desktop this will be overridden based on which button was used to join the call
      intentPreset.skipLobby = true;
      intentPreset.autoLeaveWhenOthersLeft = true;
      intentPreset.callIntent = intentPreset.callIntent ?? "video";
      break;
    // Non widget usecase defaults
    default:
      intentPreset = {
        confineToRoom: false,
        appPrompt: true,
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

  const intentAndPlatformDerivedConfiguration: IntentAndPlatformDerivedConfiguration =
    {};
  // Desktop also includes web. Its anything that is not mobile.
  const desktopMobile = platform === "desktop" ? "desktop" : "mobile";
  switch (desktopMobile) {
    case "desktop":
    case "mobile":
      switch (intent) {
        case UserIntent.StartNewCall:
        case UserIntent.JoinExistingCall:
        case UserIntent.StartNewCallDM:
        case UserIntent.JoinExistingCallDM:
          intentAndPlatformDerivedConfiguration.defaultAudioEnabled = true;
          intentAndPlatformDerivedConfiguration.defaultVideoEnabled = true;
          break;
        case UserIntent.StartNewCallDMVoice:
        case UserIntent.JoinExistingCallDMVoice:
          intentAndPlatformDerivedConfiguration.defaultAudioEnabled = true;
          intentAndPlatformDerivedConfiguration.defaultVideoEnabled = false;
          break;
      }
  }

  const properties: UrlProperties = {
    widgetId,
    parentUrl,
    // NB. we don't validate roomId here as we do in getRoomIdentifierFromUrl:
    // what would we do if it were invalid? If the widget API says that's what
    // the room ID is, then that's what it is.
    roomId: parser.getParam("roomId"),
    password: parser.getParam("password"),
    userId: isWidget ? parser.getParam("userId") : null,
    displayName: parser.getParam("displayName"),
    deviceId: isWidget ? parser.getParam("deviceId") : null,
    baseUrl: isWidget ? parser.getParam("baseUrl") : null,
    lang: parser.getParam("lang"),
    fonts: parser.getAllParams("font"),
    fontScale: Number.isNaN(fontScale) ? null : fontScale,
    theme: parser.getParam("theme"),
    viaServers: !isWidget ? parser.getParam("viaServers") : null,
    homeserver: !isWidget ? parser.getParam("homeserver") : null,
    posthogApiHost: parser.getParam("posthogApiHost"),
    posthogApiKey: parser.getParam("posthogApiKey"),
    posthogUserId:
      parser.getParam("posthogUserId") ?? parser.getParam("analyticsID"),
    rageshakeSubmitUrl: parser.getParam("rageshakeSubmitUrl"),
    sentryDsn: parser.getParam("sentryDsn"),
    sentryEnvironment: parser.getParam("sentryEnvironment"),
    e2eEnabled: parser.getFlagParam("enableE2EE", true),
  };

  const configuration: Partial<UrlConfiguration> = {
    confineToRoom: parser.getFlag("confineToRoom"),
    appPrompt: parser.getFlag("appPrompt"),
    preload: isWidget ? parser.getFlag("preload") : undefined,
    // Check hideHeader for backwards compatibility. If header is set, hideHeader
    // is ignored.
    header: parser.getEnumParam("header", HeaderStyle),
    showControls: parser.getFlag("showControls"),
    hideScreensharing: parser.getFlag("hideScreensharing"),
    allowIceFallback: parser.getFlag("allowIceFallback"),
    perParticipantE2EE: parser.getFlag("perParticipantE2EE"),
    controlledAudioDevices: parser.getFlag("controlledAudioDevices"),
    skipLobby: isWidget ? parser.getFlag("skipLobby") : false,
    // In SPA mode the user should always exit to the home screen when hanging
    // up, rather than being sent back to the lobby
    returnToLobby: isWidget ? parser.getFlag("returnToLobby") : false,
    sendNotificationType: parser.getEnumParam("sendNotificationType", [
      "ring",
      "notification",
    ]),
    waitForCallPickup: parser.getFlag("waitForCallPickup"),
    autoLeaveWhenOthersLeft: parser.getFlag("autoLeave"),
  };

  // Log the final configuration for debugging purposes.
  // This will only log when the cache is not yet set.
  logger.info(
    "UrlParams: final set of url params\n",
    "intent:",
    intent,
    "\nproperties:",
    properties,
    "configuration:",
    configuration,
    "intentAndPlatformDerivedConfiguration:",
    intentAndPlatformDerivedConfiguration,
  );

  return {
    ...properties,
    ...intentPreset,
    ...pickBy(configuration, (v?: unknown) => v !== undefined),
    ...intentAndPlatformDerivedConfiguration,
  };
};

/**
 * Hook to simplify use of getUrlParams.
 * @returns The app parameters for the current URL
 */
export const useUrlParams = (): UrlParams => {
  const { search, hash } = useLocation();
  return useMemo(() => getUrlParams(search, hash), [search, hash]);
};

export function getRoomIdentifierFromUrl(
  pathname: string,
  search: string,
  hash: string,
): RoomIdentifier {
  let roomAlias: string | null = null;
  pathname = pathname.substring(1); // Strip the "/"
  const pathComponents = pathname.split("/");
  const pathHasRoom = pathComponents[0] == "room";
  const hasRoomAlias = pathComponents.length > 1;

  // What type is our url: roomAlias in hash, room alias as the search path, roomAlias after /room/
  if (hash === "" || hash.startsWith("#?")) {
    if (hasRoomAlias && pathHasRoom) {
      roomAlias = pathComponents[1];
    }
    if (!pathHasRoom) {
      roomAlias = pathComponents[0];
    }
  } else {
    roomAlias = hash;
  }

  // Delete "?" and what comes afterwards
  roomAlias = roomAlias?.split("?")[0] ?? null;

  if (roomAlias) {
    // Make roomAlias is null, if it only is a "#"
    if (roomAlias.length <= 1) {
      roomAlias = null;
    } else {
      // Add "#", if not present
      if (!roomAlias.startsWith("#")) {
        roomAlias = `#${roomAlias}`;
      }
      // Add server part, if not present
      if (!roomAlias.includes(":")) {
        roomAlias = `${roomAlias}:${Config.defaultServerName()}`;
      }
    }
  }

  const parser = new ParamParser(search, hash);

  // Make sure roomId is valid
  let roomId: string | null = parser.getParam("roomId");
  if (roomId !== null) {
    // Replace any non-printable characters that another client may have inserted.
    // For instance on iOS, some copied links end up with zero width characters on the end which get encoded into the URL.
    // This isn't valid for a roomId, so we can freely strip the content.
    roomId = roomId.replaceAll(/^[^ -~]+|[^ -~]+$/g, "");
    if (!roomId.startsWith("!")) {
      roomId = null;
    } else if (!roomId.includes("")) {
      roomId = null;
    }
  }

  return {
    roomAlias,
    roomId,
    viaServers: parser.getAllParams("viaServers"),
  };
}

export const useRoomIdentifier = (): RoomIdentifier => {
  const { pathname, search, hash } = useLocation();
  return useMemo(
    () => getRoomIdentifierFromUrl(pathname, search, hash),
    [pathname, search, hash],
  );
};

export function generateUrlSearchParams(
  roomId: string,
  encryptionSystem: EncryptionSystem,
  viaServers?: string[],
): URLSearchParams {
  const params = new URLSearchParams();
  // The password shouldn't need URL encoding here (we generate URL-safe ones) but encode
  // it in case it came from another client that generated a non url-safe one
  switch (encryptionSystem?.kind) {
    case E2eeType.SHARED_KEY: {
      const encodedPassword = encodeURIComponent(encryptionSystem.secret);
      if (encodedPassword !== encryptionSystem.secret) {
        logger.info(
          "Encoded call password used non URL-safe chars: buggy client?",
        );
      }
      params.set("password", encodedPassword);
      break;
    }
    case E2eeType.PER_PARTICIPANT:
      params.set("perParticipantE2EE", "true");
      break;
  }
  params.set("roomId", roomId);
  viaServers?.forEach((s) => params.set("viaServers", s));

  return params;
}
