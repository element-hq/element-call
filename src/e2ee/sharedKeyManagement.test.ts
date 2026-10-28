/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { E2eeType } from "@element-hq/matrixrtc-sdk";

import {
  getKeyForRoom,
  saveKeyForRoom,
  useRoomEncryptionSystem,
} from "./sharedKeyManagement";

vi.mock("../ClientContext", () => {
  const room = { hasEncryptionStateEvent: (): boolean => false };
  const client = { getRoom: (): typeof room => room };
  return { useClient: (): { client: typeof client } => ({ client }) };
});

const roomId = "!room:example.org";
const otherRoomId = "!other:example.org";

describe("getKeyForRoom", () => {
  afterEach(() => {
    window.location.hash = "#";
    localStorage.clear();
  });

  test("prefers a key given in the parameters over the stored one", () => {
    saveKeyForRoom(roomId, "stored");
    window.location.hash = `#?roomId=${encodeURIComponent(roomId)}&password=from-the-link`;

    expect(getKeyForRoom(roomId)).toBe("from-the-link");
  });

  test("falls back to the stored key", () => {
    saveKeyForRoom(roomId, "stored");

    expect(getKeyForRoom(roomId)).toBe("stored");
  });

  test("has no key to offer for a room it has never seen", () => {
    expect(getKeyForRoom(roomId)).toBeNull();
  });

  test("prefers the stored key when the parameters are for another room", () => {
    saveKeyForRoom(roomId, "stored");
    window.location.hash = `#?roomId=${encodeURIComponent(otherRoomId)}&password=other-room`;

    expect(getKeyForRoom(roomId)).toBe("stored");
  });

  test("ignores the password in the parameters for another room", () => {
    window.location.hash = `#?roomId=${encodeURIComponent(otherRoomId)}&password=other-room`;

    expect(getKeyForRoom(roomId)).toBeNull();
  });
});

describe("useRoomEncryptionSystem", () => {
  afterEach(() => {
    window.location.hash = "#";
    localStorage.clear();
  });

  test("picks up a key saved for the room after it rendered", () => {
    const { result } = renderHook(() => useRoomEncryptionSystem(roomId));
    expect(result.current).toEqual({ kind: E2eeType.NONE });

    act(() => saveKeyForRoom(roomId, "stored"));

    expect(result.current).toEqual({
      kind: E2eeType.SHARED_KEY,
      secret: "stored",
    });
  });

  test("stores a key from the parameters under the room's key only", () => {
    window.location.hash = `#?roomId=${encodeURIComponent(roomId)}&password=from-the-link`;

    renderHook(() => useRoomEncryptionSystem(roomId));

    expect(Object.keys(localStorage)).toEqual([`room-shared-key-${roomId}`]);
    expect(getKeyForRoom(roomId)).toBe("from-the-link");
  });

  test("keeps the stored key when the parameters are for another room", () => {
    saveKeyForRoom(roomId, "stored");
    window.location.hash = `#?roomId=${encodeURIComponent(otherRoomId)}&password=other-room`;

    const { result } = renderHook(() => useRoomEncryptionSystem(roomId));

    expect(result.current).toEqual({
      kind: E2eeType.SHARED_KEY,
      secret: "stored",
    });
    expect(localStorage.getItem(`room-shared-key-${roomId}`)).toBe("stored");
  });
});
