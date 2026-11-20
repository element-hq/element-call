/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";

/** What the SDK needs of the client. */
type SdkClientPart = Pick<
  MatrixClient,
  // Our own membership identity
  | "getUserId"
  | "getDeviceId"
  // The session: memberships, delayed leave events, sticky events, call
  // notifications, and the media keys sent to device
  | "fetchCapabilities"
  | "getCachedCapabilities"
  | "sendEvent"
  | "sendStateEvent"
  | "_unstable_sendDelayedStateEvent"
  | "_unstable_cancelScheduledDelayedEvent"
  | "_unstable_restartScheduledDelayedEvent"
  | "_unstable_sendScheduledDelayedEvent"
  | "_unstable_sendStickyEvent"
  | "_unstable_sendStickyDelayedEvent"
  | "encryptAndSendToDevice"
  // Local transport discovery
  | "getDomain"
  | "getRTCTransports"
  // LiveKit auth: `getOpenIdToken` for the JWT service flow, `getLivekitToken`
  // for the client-server API flow (MSC4195), `delegateDelayedLeave` and
  // `baseUrl` for the delayed leave delegation and its probe
  | "getOpenIdToken"
  | "getLivekitToken"
  | "delegateDelayedLeave"
  | "baseUrl"
  // Homeserver connection: whether the client is syncing
  | "getSyncState"
>;

/** What the SDK needs of the room. */
type SdkRoomPart = Pick<
  Room,
  | "roomId"
  // The members' display names and avatars
  | "getMembersWithMembership"
  // The session: memberships from the room's state, timeline and sticky events
  | "getLiveTimeline"
  | "getVersion"
  | "hasMembershipState"
  | "_unstable_getStickyEvents"
>;

/**
 * STOP GAP: what the SDK needs of a Matrix client and room, on one object.
 * Only their emitters stay apart, since both have an `on` and an `off`. It is
 * to converge, along with the SDK that takes it, on whichever API fits every
 * layer best.
 */
export interface SdkMatrixBackend extends SdkClientPart, SdkRoomPart {
  /**
   * `ClientEvent.Sync` (homeserver connection) and `ClientEvent.ToDeviceEvent`
   * (the session's media keys)
   */
  clientEmitter: Pick<MatrixClient, "on" | "off">;
  /** The room's state, member and sticky events */
  roomEmitter: Pick<Room, "on" | "off">;
}

/** The SDK's backend from a client and a room. */
export function createSdkMatrixBackend(
  client: SdkClientPart & Pick<MatrixClient, "on" | "off">,
  room: SdkRoomPart & Pick<Room, "on" | "off">,
): SdkMatrixBackend {
  return {
    getUserId: client.getUserId.bind(client),
    getDeviceId: client.getDeviceId.bind(client),
    fetchCapabilities: client.fetchCapabilities.bind(client),
    getCachedCapabilities: client.getCachedCapabilities.bind(client),
    sendEvent: client.sendEvent.bind(client),
    sendStateEvent: client.sendStateEvent.bind(client),
    _unstable_sendDelayedStateEvent:
      client._unstable_sendDelayedStateEvent.bind(client),
    _unstable_cancelScheduledDelayedEvent:
      client._unstable_cancelScheduledDelayedEvent.bind(client),
    _unstable_restartScheduledDelayedEvent:
      client._unstable_restartScheduledDelayedEvent.bind(client),
    _unstable_sendScheduledDelayedEvent:
      client._unstable_sendScheduledDelayedEvent.bind(client),
    _unstable_sendStickyEvent: client._unstable_sendStickyEvent.bind(client),
    _unstable_sendStickyDelayedEvent:
      client._unstable_sendStickyDelayedEvent.bind(client),
    encryptAndSendToDevice: client.encryptAndSendToDevice.bind(client),
    getDomain: client.getDomain.bind(client),
    getRTCTransports: client.getRTCTransports.bind(client),
    getOpenIdToken: client.getOpenIdToken.bind(client),
    getLivekitToken: client.getLivekitToken.bind(client),
    delegateDelayedLeave: client.delegateDelayedLeave.bind(client),
    baseUrl: client.baseUrl,
    getSyncState: client.getSyncState.bind(client),
    roomId: room.roomId,
    getMembersWithMembership: room.getMembersWithMembership.bind(room),
    getLiveTimeline: room.getLiveTimeline.bind(room),
    getVersion: room.getVersion.bind(room),
    hasMembershipState: room.hasMembershipState.bind(room),
    _unstable_getStickyEvents: room._unstable_getStickyEvents.bind(room),
    clientEmitter: client,
    roomEmitter: room,
  };
}

/**
 * STOP GAP: the backend as the client (or the room) code written against one
 * still expects, with that side's `on` and `off`.
 */
export function withEmitter<
  Backend extends object,
  Emitter extends {
    on: (...args: never[]) => unknown;
    off: (...args: never[]) => unknown;
  },
>(backend: Backend, emitter: Emitter): Backend & Pick<Emitter, "on" | "off"> {
  return Object.defineProperties<object>(
    { on: emitter.on.bind(emitter), off: emitter.off.bind(emitter) },
    Object.getOwnPropertyDescriptors(backend),
  ) as Backend & Pick<Emitter, "on" | "off">;
}
