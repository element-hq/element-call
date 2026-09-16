/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test } from "vitest";

import { getKeyForRoom, saveKeyForRoom } from "./sharedKeyManagement";

const roomId = "!room:example.org";

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
});
