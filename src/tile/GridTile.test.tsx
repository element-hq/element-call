/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { RemoteTrackPublication } from "livekit-client";
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { of } from "rxjs";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

import { GridTile } from "./GridTile";
import { withRemoteMedia } from "../utils/test";
import { GridTileViewModel } from "../state/TileViewModel";
import { ReactionsProvider } from "../useReactions";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;

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
      const fakeRtcSession = {
        on: () => {},
        off: () => {},
        room: {
          on: () => {},
          off: () => {},
          client: {
            getUserId: () => null,
          },
        },
        memberships: [],
      } as unknown as MatrixRTCSession;
      const { container } = render(
        <ReactionsProvider rtcSession={fakeRtcSession}>
          <GridTile
            vm={new GridTileViewModel(of(vm))}
            onOpenProfile={() => {}}
            targetWidth={300}
            targetHeight={200}
            showSpeakingIndicators
          />
        </ReactionsProvider>,
      );
      expect(await axe(container)).toHaveNoViolations();
      // Name should be visible
      screen.getByText("Alice");
    },
  );
});
