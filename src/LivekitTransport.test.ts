/*
Copyright 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "vitest";
import { isLivekitTransport } from "./LivekitTransport";

test("isLivekitTransport", () => {
  expect(
    isLivekitTransport({
      type: "livekit",
      livekit_service_url: "http://test.com",
    }),
  ).toBeTruthy();
  expect(isLivekitTransport({ type: "livekit" })).toBeFalsy();
  expect(
    isLivekitTransport({
      type: "not-livekit",
      livekit_service_url: "http://test.com",
    }),
  ).toBeFalsy();
  expect(
    isLivekitTransport({ type: "livekit", other_service_url: "multi_sfu" }),
  ).toBeFalsy();
});
