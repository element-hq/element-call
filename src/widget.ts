/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  EventType,
  createRoomWidgetClient,
  type MatrixClient,
} from "matrix-js-sdk";
import {
  WidgetApi,
  MatrixCapabilities,
  WidgetApiToWidgetAction,
} from "matrix-widget-api";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { LazyEventEmitter } from "./LazyEventEmitter";
import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";
import { ElementCallReactionEventType } from "./reactions";

// Subset of the actions in element-web
export enum ElementWidgetActions {
  JoinCall = "io.element.join",
  HangupCall = "im.vector.hangup",
  Close = "io.element.close",
  // This can be sent as from or to widget
  // fromWidget: updates the client about the current device mute state
  // toWidget: the client requests a specific device mute configuration
  //   The reply will always be the resulting configuration
  //   It is possible to sent an empty configuration to retrieve the current values or
  //   just one of the fields to update that particular value
  //   An undefined field means that EC will keep the mute state as is.
  //   -> this will allow the client to only get the current state
  //
  // The data of the widget action request and the response are:
  // {
  //   audio_enabled?: boolean,
  //   video_enabled?: boolean
  // }
  DeviceMute = "io.element.device_mute",
}

export interface JoinCallData {
  audioInput: string | null;
  videoInput: string | null;
}

export interface WidgetHelpers {
  api: WidgetApi;
  lazyActions: LazyEventEmitter;
  client: Promise<MatrixClient>;
}

/**
 * A point of access to the widget API, if the app is running as a widget. This
 * is initialized with `initializeWidget`. This should happen at the top level because the widget messaging
 * needs to be set up ASAP on load to ensure it doesn't miss any requests.
 */
export let widget: WidgetHelpers | null = null;

/**
 * Should be called as soon as possible on app start. (In the initilizer before react)
 */
// this needs to be a seperate call and cannot be done on import to allow us to spy on methods in here before
// execution.
export const initializeWidget = (
  rtcApplication: string = "m.call",
  sendRoomEvents = false,
): void => {
  try {
    const {
      widgetId,
      parentUrl,
      roomId,
      userId,
      deviceId,
      baseUrl,
      e2eEnabled,
      allowIceFallback,
    } = getUrlParams();

    if (!roomId) throw new Error("Room ID must be supplied");
    if (!userId) throw new Error("User ID must be supplied");
    if (!deviceId) throw new Error("Device ID must be supplied");
    if (!baseUrl) throw new Error("Base URL must be supplied");
    if (widgetId && parentUrl) {
      const parentOrigin = new URL(parentUrl).origin;
      logger.info("Widget API is available");
      const api = new WidgetApi(widgetId, parentOrigin);
      api.requestCapability(MatrixCapabilities.AlwaysOnScreen);
      api.requestCapability(MatrixCapabilities.MSC4039DownloadFile);

      // Set up the lazy action emitter, but only for select actions that we
      // intend for the app to handle
      const lazyActions = new LazyEventEmitter();
      [
        WidgetApiToWidgetAction.ThemeChange,
        ElementWidgetActions.JoinCall,
        ElementWidgetActions.HangupCall,
        ElementWidgetActions.DeviceMute,
      ].forEach((action) => {
        api.on(`action:${action}`, (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          lazyActions.emit(action, ev);
        });
      });

      // Now, initialize the matryoshka MatrixClient (so named because it routes
      // all requests through the host client via the widget API)
      // We need to do this now rather than later because it has capabilities to
      // request, and is responsible for starting the transport (should it be?)

      // These are all the event types the app uses
      const sendEvent = [
        EventType.CallNotify, // Sent as a deprecated fallback
        EventType.RTCNotification,
      ];
      if (sendRoomEvents) {
        sendEvent.push(EventType.RoomMessage);
      }
      const sendRecvEvent = [
        "org.matrix.rageshake_request",
        EventType.CallEncryptionKeysPrefix,
        EventType.Reaction,
        EventType.RoomRedaction,
        ElementCallReactionEventType,
        EventType.RTCDecline,
        EventType.RTCMembership,
      ];

      const sendState = [
        userId, // Legacy call membership events
        `_${userId}_${deviceId}_${rtcApplication}`, // Session membership events
        `${userId}_${deviceId}_${rtcApplication}`, // The above with no leading underscore, for room versions whose auth rules allow it
      ].map((stateKey) => ({
        eventType: EventType.GroupCallMemberPrefix,
        stateKey,
      }));
      const receiveState = [
        { eventType: EventType.RoomCreate },
        { eventType: EventType.RoomName },
        { eventType: EventType.RoomMember },
        { eventType: EventType.RoomEncryption },
        { eventType: EventType.GroupCallMemberPrefix },
      ];

      const sendRecvToDevice = [
        EventType.CallInvite,
        EventType.CallCandidates,
        EventType.CallAnswer,
        EventType.CallHangup,
        EventType.CallReject,
        EventType.CallSelectAnswer,
        EventType.CallNegotiate,
        EventType.CallSDPStreamMetadataChanged,
        EventType.CallSDPStreamMetadataChangedPrefix,
        EventType.CallReplaces,
        EventType.CallEncryptionKeysPrefix,
      ];

      const client = createRoomWidgetClient(
        api,
        {
          sendEvent: [...sendEvent, ...sendRecvEvent],
          receiveEvent: sendRecvEvent,
          sendState,
          receiveState,
          sendToDevice: sendRecvToDevice,
          receiveToDevice: sendRecvToDevice,
          turnServers: false,
          sendDelayedEvents: true,
          updateDelayedEvents: true,
          sendSticky: true,
          receiveSticky: true,
        },
        roomId,
        {
          baseUrl,
          userId,
          deviceId,
          timelineSupport: true,
          useE2eForGroupCall: e2eEnabled,
          fallbackICEServerAllowed: allowIceFallback,
        },
        // ContentLoaded event will be sent as soon as the theme is set (see useTheme.ts)
        false,
      );

      const clientPromise = async (): Promise<MatrixClient> => {
        // Wait for the config file to be ready (we load very early on so it might not
        // be otherwise)
        await Config.init();
        await client.startClient({ clientWellKnownPollPeriod: 60 * 10 });
        return client;
      };

      widget = { api, lazyActions, client: clientPromise() };
    } else {
      if (import.meta.env.MODE !== "test")
        logger.info("No widget API available");
      widget = null;
    }
  } catch (e) {
    logger.warn("Continuing without the widget API", e);
    widget = null;
  }
};
