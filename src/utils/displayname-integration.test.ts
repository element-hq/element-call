/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { type RoomMember } from "matrix-js-sdk";

import { shouldDisambiguate } from "./displayname";
import { alice } from "./test-fixtures";

// Ideally these tests would be in ./displayname.test.ts but I can't figure out how to
// just spy on the removeHiddenChars() function without impacting the other tests.
// So, these tests are in this separate test file.
vi.mock("matrix-js-sdk/lib/utils");

describe("shouldDisambiguate", () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let jsUtils: typeof import("matrix-js-sdk/lib/utils");

  beforeAll(async () => {
    jsUtils = await import("matrix-js-sdk/lib/utils");
    vi.spyOn(jsUtils, "removeHiddenChars").mockImplementation((str) => str);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("should only call removeHiddenChars once for a single displayname", () => {
    const room: Map<string, Pick<RoomMember, "userId">> = new Map([]);
    shouldDisambiguate(alice, [], room);
    expect(jsUtils.removeHiddenChars).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      shouldDisambiguate(alice, [], room);
    }
    expect(jsUtils.removeHiddenChars).toHaveBeenCalledTimes(1);
  });
});
