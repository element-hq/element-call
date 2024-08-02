/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { logger } from "matrix-js-sdk/src/logger";
import { EventType } from "matrix-js-sdk/src/@types/event";
import { createRoomWidgetClient } from "matrix-js-sdk/src/matrix";
import { WidgetApi, MatrixCapabilities } from "matrix-widget-api";

import type { MatrixClient } from "matrix-js-sdk/src/client";
import type { IWidgetApiRequest } from "matrix-widget-api";
import { LazyEventEmitter } from "./LazyEventEmitter";
import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";

// Subset of the actions in matrix-react-sdk
export enum ElementWidgetActions {
  JoinCall = "io.element.join",
  HangupCall = "im.vector.hangup",
  TileLayout = "io.element.tile_layout",
  SpotlightLayout = "io.element.spotlight_layout",

  // Element Call -> host requesting to start a screenshare
  // (ie. expects a ScreenshareStart once the user has picked a source)
  // Element Call -> host requesting to start a screenshare
  // (ie. expects a ScreenshareStart once the user has picked a source)
  // replies with { pending } where pending is true if the host has asked
  // the user to choose a window and false if not (ie. if the host isn't
  // running within Electron)
  ScreenshareRequest = "io.element.screenshare_request",
  // host -> Element Call telling EC to start screen sharing with
  // the given source
  ScreenshareStart = "io.element.screenshare_start",
  // host -> Element Call telling EC to stop screen sharing, or that
  // the user cancelled when selecting a source after a ScreenshareRequest
  ScreenshareStop = "io.element.screenshare_stop",
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

export interface ScreenshareStartData {
  desktopCapturerSourceId: string;
}

export interface WidgetHelpers {
  api: WidgetApi;
  lazyActions: LazyEventEmitter;
  client: Promise<MatrixClient>;
}

/**
 * A point of access to the widget API, if the app is running as a widget. This
 * is declared and initialized on the top level because the widget messaging
 * needs to be set up ASAP on load to ensure it doesn't miss any requests.
 */
export const widget = ((): WidgetHelpers | null => {
  try {
    const { widgetId, parentUrl } = getUrlParams();

    if (widgetId && parentUrl) {
      const parentOrigin = new URL(parentUrl).origin;
      logger.info("Widget API is available");
      const api = new WidgetApi(widgetId, parentOrigin);
      api.requestCapability(MatrixCapabilities.AlwaysOnScreen);

      // Set up the lazy action emitter, but only for select actions that we
      // intend for the app to handle
      const lazyActions = new LazyEventEmitter();
      [
        ElementWidgetActions.JoinCall,
        ElementWidgetActions.HangupCall,
        ElementWidgetActions.TileLayout,
        ElementWidgetActions.SpotlightLayout,
        ElementWidgetActions.ScreenshareStart,
        ElementWidgetActions.ScreenshareStop,
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

      const {
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

      // These are all the event types the app uses
      const sendRecvEvent = [
        "org.matrix.rageshake_request",
        EventType.CallEncryptionKeysPrefix,
      ];

      const sendState = [
        userId, // Legacy call membership events
        `_${userId}_${deviceId}`, // Session membership events
        `${userId}_${deviceId}`, // The above with no leading underscore, for room versions whose auth rules allow it
      ].map((stateKey) => ({
        eventType: EventType.GroupCallMemberPrefix,
        stateKey,
      }));
      const receiveState = [
        { eventType: EventType.RoomCreate },
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
      ];

      const client = createRoomWidgetClient(
        api,
        {
          sendEvent: sendRecvEvent,
          receiveEvent: sendRecvEvent,
          sendState,
          receiveState,
          sendToDevice: sendRecvToDevice,
          receiveToDevice: sendRecvToDevice,
          turnServers: false,
          sendDelayedEvents: true,
          updateDelayedEvents: true,
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

      const clientPromise = new Promise<MatrixClient>((resolve) => {
        (async (): Promise<void> => {
          // Wait for the config file to be ready (we load very early on so it might not
          // be otherwise)
          await Config.init();
          await client.startClient({ clientWellKnownPollPeriod: 60 * 10 });
          resolve(client);
        })();
      });

      return { api, lazyActions, client: clientPromise };
    } else {
      logger.info("No widget API available");
      return null;
    }
  } catch (e) {
    logger.warn("Continuing without the widget API", e);
    return null;
  }
})();
