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
import { getRoomParams } from "./room/useRoomParams";

// Subset of the actions in matrix-react-sdk
export enum ElementWidgetActions {
  JoinCall = "io.element.join",
  HangupCall = "im.vector.hangup",
  TileLayout = "io.element.tile_layout",
  SpotlightLayout = "io.element.spotlight_layout",
}

export interface JoinCallData {
  audioInput: string | null;
  videoInput: string | null;
}

interface WidgetHelpers {
  api: WidgetApi;
  lazyActions: LazyEventEmitter;
  client: Promise<MatrixClient>;
}

/**
 * A point of access to the widget API, if the app is running as a widget. This
 * is declared and initialized on the top level because the widget messaging
 * needs to be set up ASAP on load to ensure it doesn't miss any requests.
 */
export const widget: WidgetHelpers | null = (() => {
  try {
    const query = new URLSearchParams(window.location.search);
    const widgetId = query.get("widgetId");
    const parentUrl = query.get("parentUrl");

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

      const { roomId, userId, deviceId } = getRoomParams();
      if (!roomId) throw new Error("Room ID must be supplied");
      if (!userId) throw new Error("User ID must be supplied");
      if (!deviceId) throw new Error("Device ID must be supplied");

      // These are all the event types the app uses
      const sendState = [
        { eventType: EventType.GroupCallPrefix },
        { eventType: EventType.GroupCallMemberPrefix, stateKey: userId },
      ];
      const receiveState = [
        { eventType: EventType.RoomMember },
        { eventType: EventType.GroupCallPrefix },
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
          sendState,
          receiveState,
          sendToDevice: sendRecvToDevice,
          receiveToDevice: sendRecvToDevice,
          turnServers: true,
        },
        roomId,
        {
          baseUrl: "",
          userId,
          deviceId,
          timelineSupport: true,
        }
      );
      const clientPromise = client.startClient().then(() => client);

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
