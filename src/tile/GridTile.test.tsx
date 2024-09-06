/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
