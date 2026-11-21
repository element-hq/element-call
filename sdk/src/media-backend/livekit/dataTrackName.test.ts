/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  fromLivekitDataTrackName,
  toLivekitDataTrackName,
} from "./dataTrackName";

describe("data track names on LiveKit", () => {
  it.each([true, false])("round-trips reliable=%s", (reliable) => {
    expect(
      fromLivekitDataTrackName(toLivekitDataTrackName("chat:room", reliable)),
    ).toEqual({ name: "chat:room", reliable });
  });

  it("reads a name without a prefix as lossy", () => {
    expect(fromLivekitDataTrackName("telemetry")).toEqual({
      name: "telemetry",
      reliable: false,
    });
  });
});
