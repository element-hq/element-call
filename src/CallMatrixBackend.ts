/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import {
  createSdkMatrixBackend,
  type SdkMatrixBackend,
} from "@element-hq/matrixrtc-sdk";

/** What a call needs of the client beyond the SDK's part. */
type CallClientPart = Pick<
  MatrixClient,
  // Reactions and raised hands: decrypting, and lowering a hand
  | "decryptEventIfNeeded"
  | "redactEvent"
  // Our own display name and avatar
  | "getUser"
  // Changing them, where the host lets us (`supportsProfileChanges`)
  | "setDisplayName"
  | "setAvatarUrl"
  | "uploadContent"
  // Developer settings
  | "doesServerSupportUnstableFeature"
  | "getCrypto"
>;

/** What a call needs of the room beyond the SDK's part. */
type CallRoomPart = Pick<
  Room,
  // The header and the invite link
  | "name"
  | "getMxcAvatarUrl"
  // Whether to offer the invite link
  | "getJoinRule"
  // Raised hands already in the room
  | "relations"
>;

/**
 * STOP GAP: everything a call needs from Matrix on one object. Its
 * `clientEmitter` also carries `MatrixEventEvent.Decrypted` (reactions); its
 * `roomEmitter` every room event.
 */
export interface CallMatrixBackend
  extends SdkMatrixBackend, CallClientPart, CallRoomPart {}

/** A call's backend from a client and a room. */
export function createCallMatrixBackend(
  client: Parameters<typeof createSdkMatrixBackend>[0] & CallClientPart,
  room: Parameters<typeof createSdkMatrixBackend>[1] & CallRoomPart,
): CallMatrixBackend {
  return {
    ...createSdkMatrixBackend(client, room),
    decryptEventIfNeeded: client.decryptEventIfNeeded.bind(client),
    redactEvent: client.redactEvent.bind(client),
    getUser: client.getUser.bind(client),
    setDisplayName: client.setDisplayName.bind(client),
    setAvatarUrl: client.setAvatarUrl.bind(client),
    uploadContent: client.uploadContent.bind(client),
    doesServerSupportUnstableFeature:
      client.doesServerSupportUnstableFeature.bind(client),
    getCrypto: client.getCrypto.bind(client),
    // Read through: the room is renamed while we show it
    get name() {
      return room.name;
    },
    getMxcAvatarUrl: room.getMxcAvatarUrl.bind(room),
    getJoinRule: room.getJoinRule.bind(room),
    get relations() {
      return room.relations;
    },
  };
}
