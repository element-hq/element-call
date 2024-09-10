/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { RemoteTrackPublication } from "livekit-client";
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";

import { GridTile } from "./GridTile";
import { withRemoteMedia } from "../utils/test";

test("GridTile is accessible", async () => {
  await withRemoteMedia(
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    {
      setVolume() {},
      getTrackPublication: () =>
        ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    },
    async (vm) => {
      const { container } = render(
        <GridTile
          vm={vm}
          onOpenProfile={() => {}}
          targetWidth={300}
          targetHeight={200}
          showVideo
          showSpeakingIndicators
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
      // Name should be visible
      screen.getByText("Alice");
    },
  );
});
