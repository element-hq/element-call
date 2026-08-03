/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { type Tab, TabContainer } from "./Tabs";

function renderTabs<K extends string>(tabs: Tab<K>[], tab: K): void {
  render(
    <TabContainer
      label="Settings"
      tab={tab}
      onTabChange={vi.fn()}
      tabs={tabs}
    />,
  );
}

function expectTabPositions(expectedNames: string[]): void {
  const tabs = within(
    screen.getByRole("tablist", { name: "Settings" }),
  ).getAllByRole("tab");

  expect(tabs).toHaveLength(expectedNames.length);
  tabs.forEach((tab, index) => {
    expect(tab).toHaveTextContent(expectedNames[index]);
    expect(tab).toHaveAttribute(
      "aria-setsize",
      expectedNames.length.toString(),
    );
    expect(tab).toHaveAttribute("aria-posinset", (index + 1).toString());
  });
}

it("sets tab collection size and positions for two tabs", () => {
  renderTabs(
    [
      { key: "audio", name: "Audio", content: "Audio panel" },
      { key: "video", name: "Video", content: "Video panel" },
    ],
    "audio",
  );

  expectTabPositions(["Audio", "Video"]);
});

it("sets tab collection size and positions for four tabs", () => {
  renderTabs(
    [
      { key: "audio", name: "Audio", content: "Audio panel" },
      { key: "video", name: "Video", content: "Video panel" },
      { key: "profile", name: "Profile", content: "Profile panel" },
      {
        key: "preferences",
        name: "Preferences",
        content: "Preferences panel",
      },
    ],
    "profile",
  );

  expectTabPositions(["Audio", "Video", "Profile", "Preferences"]);
});

it("fires tab changes and keeps the active tab selected", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();
  const tabs = [
    { key: "audio", name: "Audio", content: "Audio panel" },
    { key: "video", name: "Video", content: "Video panel" },
  ] satisfies Tab<string>[];

  const { rerender } = render(
    <TabContainer
      label="Settings"
      tab="audio"
      onTabChange={onTabChange}
      tabs={tabs}
    />,
  );

  expect(screen.getByRole("tab", { name: "Audio" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await user.click(screen.getByRole("tab", { name: "Video" }));
  expect(onTabChange).toHaveBeenCalledWith("video");

  rerender(
    <TabContainer
      label="Settings"
      tab="video"
      onTabChange={onTabChange}
      tabs={tabs}
    />,
  );

  expect(screen.getByRole("tab", { name: "Video" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("only shows the selected tab panel", () => {
  renderTabs(
    [
      { key: "audio", name: "Audio", content: "Audio panel" },
      { key: "video", name: "Video", content: "Video panel" },
      { key: "profile", name: "Profile", content: "Profile panel" },
    ],
    "video",
  );

  expect(screen.getByText("Audio panel")).not.toBeVisible();
  expect(screen.getByText("Video panel")).toBeVisible();
  expect(screen.getByText("Profile panel")).not.toBeVisible();
});
