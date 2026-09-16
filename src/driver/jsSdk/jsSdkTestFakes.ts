/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Fakes shared by the js-sdk driver tests. The drivers tell the two client
// kinds apart by prototype, so each fake is created on the real prototype
// and given only the members it needs; EventEmitter sits at the bottom of
// that chain, so `on`/`emit` work.

import { EventEmitter } from "events";
import {
  MatrixClient,
  type Room,
  RoomWidgetClient,
  SyncState,
  User,
} from "matrix-js-sdk";
import { vi } from "vitest";

export const ROOM_ID = "!room:example.org";
export const ME = "@me:example.org";
export const MY_DEVICE = "MYDEV";
export const LK = "https://lk.example.org";

export const openIdToken = {
  access_token: "openid",
  expires_in: 3600,
  matrix_server_name: "example.org",
  token_type: "Bearer",
};

type Fn = ReturnType<typeof vi.fn>;

export interface FakeClient extends EventEmitter {
  _unstable_sendStickyEvent: Fn;
  _unstable_sendDelayedEvent: Fn;
  _unstable_sendStickyDelayedEvent: Fn;
  _unstable_sendDelayedStateEvent: Fn;
  _unstable_updateDelayedEvent: Fn;
  _unstable_getRTCTransports: Fn;
  sendStateEvent: Fn;
  encryptAndSendToDevice: Fn;
  sendEvent: Fn;
  redactEvent: Fn;
  getSyncState: Fn;
  getUser: (userId: string) => User | null;
  http: { authedRequest: Fn };
}

export interface FakeRoom extends EventEmitter {
  name: string;
}

function clientMembers(widget: boolean): Record<string, unknown> {
  const user = new User(ME);
  user.rawDisplayName = "Me";
  user.avatarUrl = "mxc://example.org/me";
  const verification = { signedByOwner: true };
  return {
    baseUrl: "https://hs.example.org",
    getUserId: () => ME,
    getDeviceId: () => MY_DEVICE,
    getAccessToken: () => (widget ? null : "token"),
    getCrypto: () =>
      widget
        ? undefined
        : {
            getVersion: () => "fake 1.0",
            getDeviceVerificationStatus: async () =>
              Promise.resolve(verification),
            getUserDeviceInfo: async () => Promise.resolve(new Map()),
          },
    getSyncState: vi.fn(() => SyncState.Syncing),
    getUser: () => user,
    getOpenIdToken: async () => Promise.resolve(openIdToken),
    decryptEventIfNeeded: async () => Promise.resolve(),
    doesServerSupportUnstableFeature: async () => Promise.resolve(true),
    mxcUrlToHttp: (mxc: string) => `https://hs.example.org/media/${mxc}`,
    _unstable_sendStickyEvent: vi.fn(async () =>
      Promise.resolve({ event_id: "$sticky" }),
    ),
    _unstable_sendDelayedEvent: vi.fn(async () =>
      Promise.resolve({ delay_id: "delay-plain" }),
    ),
    _unstable_sendStickyDelayedEvent: vi.fn(async () =>
      Promise.resolve({ delay_id: "delay-sticky" }),
    ),
    _unstable_sendDelayedStateEvent: vi.fn(async () =>
      Promise.resolve({ delay_id: "delay-state" }),
    ),
    _unstable_updateDelayedEvent: vi.fn(async () => Promise.resolve({})),
    _unstable_getRTCTransports: vi.fn(async () => Promise.resolve([])),
    sendStateEvent: vi.fn(async () => Promise.resolve({ event_id: "$state" })),
    encryptAndSendToDevice: vi.fn(async () => Promise.resolve()),
    sendEvent: vi.fn(async () => Promise.resolve({ event_id: "$sent" })),
    redactEvent: vi.fn(async () => Promise.resolve({ event_id: "$redaction" })),
  };
}

export function fakeRoom(): FakeRoom {
  const room = new EventEmitter() as FakeRoom;
  const alice = {
    userId: "@a:example.org",
    rawDisplayName: "Alice",
    getMxcAvatarUrl: () => "mxc://example.org/alice",
  };
  const bob = {
    userId: "@b:example.org",
    rawDisplayName: undefined,
    getMxcAvatarUrl: () => undefined,
  };
  Object.assign(room, {
    roomId: ROOM_ID,
    name: "Standup",
    getCanonicalAlias: () => "#standup:example.org",
    getMxcAvatarUrl: () => "mxc://example.org/room",
    hasEncryptionStateEvent: () => true,
    currentState: {
      getJoinRule: () => "public",
      getStateEvents: () => [],
      maySendStateEvent: () => true,
    },
    getMembersWithMembership: (membership: string) =>
      membership === "join" ? [alice] : [bob],
    _unstable_getStickyEvents: () => [],
    relations: { getChildEventsForEvent: () => undefined },
  });
  return room;
}

export function fakeClient(widget: boolean): FakeClient {
  const client = Object.create(
    widget ? RoomWidgetClient.prototype : MatrixClient.prototype,
  ) as FakeClient;
  Object.assign(client, clientMembers(widget));
  return client;
}

export const asClient = (client: FakeClient): MatrixClient =>
  client as unknown as MatrixClient;
export const asRoom = (room: FakeRoom): Room => room as unknown as Room;

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
