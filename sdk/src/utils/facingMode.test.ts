/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { facingModeOf } from "./facingMode";

function camera(label: string, facingMode?: string): MediaStreamTrack {
  return {
    label,
    getSettings: () => (facingMode === undefined ? {} : { facingMode }),
  } as MediaStreamTrack;
}

describe("facingModeOf", () => {
  it.each([
    { label: "Back Camera", facingMode: "environment", faces: "environment" },
    { label: "iPhone Camera", facingMode: "user", faces: "user" },
    { label: "FaceTime HD Camera", facingMode: undefined, faces: "user" },
    { label: "", facingMode: undefined, faces: "user" },
    {
      label: "Alice's iPhone Camera",
      facingMode: undefined,
      faces: "environment",
    },
    { label: "iPad Camera", facingMode: undefined, faces: "environment" },
    {
      label: " OBS Virtual Camera ",
      facingMode: undefined,
      faces: "environment",
    },
    { label: "Integrated Camera", facingMode: "left", faces: "user" },
  ])(
    "takes $label ($facingMode) to face $faces",
    ({ label, facingMode, faces }) => {
      expect(facingModeOf(camera(label, facingMode))).toBe(faces);
    },
  );
});
