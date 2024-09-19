/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { test, expect, vi } from "vitest";
import { isInaccessible, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";

import { SpotlightTile } from "./SpotlightTile";
import { withLocalMedia, withRemoteMedia } from "../utils/test";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
} as unknown as typeof IntersectionObserver;

test("SpotlightTile is accessible", async () => {
  await withRemoteMedia(
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    {},
    async (vm1) => {
      await withLocalMedia(
        {
          rawDisplayName: "Bob",
          getMxcAvatarUrl: () => "mxc://dlskf",
        },
        async (vm2) => {
          const user = userEvent.setup();
          const toggleExpanded = vi.fn();
          const { container } = render(
            <SpotlightTile
              vms={[vm1, vm2]}
              targetWidth={300}
              targetHeight={200}
              maximised={false}
              expanded={false}
              onToggleExpanded={toggleExpanded}
              showIndicators
            />,
          );

          expect(await axe(container)).toHaveNoViolations();
          // Alice should be in the spotlight, with her name and avatar on the
          // first page
          screen.getByText("Alice");
          const aliceAvatar = screen.getByRole("img");
          expect(screen.queryByRole("button", { name: "common.back" })).toBe(
            null,
          );
          // Bob should be out of the spotlight, and therefore invisible
          expect(isInaccessible(screen.getByText("Bob"))).toBe(true);
          // Now navigate to Bob
          await user.click(screen.getByRole("button", { name: "common.next" }));
          screen.getByText("Bob");
          expect(screen.getByRole("img")).not.toBe(aliceAvatar);
          expect(isInaccessible(screen.getByText("Alice"))).toBe(true);
          // Can toggle whether the tile is expanded
          await user.click(
            screen.getByRole("button", { name: "video_tile.expand" }),
          );
          expect(toggleExpanded).toHaveBeenCalled();
        },
      );
    },
  );
});
