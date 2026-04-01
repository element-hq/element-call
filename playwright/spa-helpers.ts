/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page } from "@playwright/test";

import { type RtcMode } from "./widget/test-helpers.ts";

/**
 * Create and join a call from the SPA home page.
 *
 * @param page - The Playwright page object
 * @param userName - The display name to use for the call
 * @param callName - The name of the call to create
 * @param autoJoin - Whether to automatically join the call after creating it
 * @param mode - The RTC mode to use for the call
 */
async function createCall(
  page: Page,
  userName: string,
  callName: string,
  autoJoin: boolean = false,
  mode: RtcMode | undefined = undefined,
): Promise<void> {
  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill(callName);
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill(userName);
  await page.getByTestId("home_go").click();

  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  if (mode) {
    await setRtcModeFromSettings(page, mode);
  }

  await switchNoiseSuppressionFromSettings(page);

  if (autoJoin) {
    // Join the call
    await page.getByTestId("lobby_joinCall").click();
  }
}

/**
 * Get the invite link for the current call.
 */
async function getCallInviteLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(
    page.getByRole("heading", { name: "Invite to this call" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "QR Code" })).toBeVisible();
  await expect(page.getByTestId("modal_inviteLink")).toBeVisible();
  await expect(page.getByTestId("modal_inviteLink")).toBeVisible();
  await page.getByTestId("modal_inviteLink").click();

  const inviteLink = (await page.evaluate(
    "navigator.clipboard.readText()",
  )) as string;
  expect(inviteLink).toContain("room/#/");

  return inviteLink;
}

/**
 * Join a call from an invitation link.
 * @param page - The Playwright page object
 * @param inviteLink - The invite link to join
 * @param displayName - The display name to use when joining the call
 * @param mode - The RTC mode to use for the call
 */
async function joinCallFromInviteLink(
  page: Page,
  inviteLink: string,
  displayName: string = "Invitee",
  mode: RtcMode | undefined = undefined,
): Promise<void> {
  await page.goto(inviteLink);
  await page.getByTestId("joincall_displayName").fill(displayName);
  await expect(page.getByTestId("joincall_joincall")).toBeVisible();
  await page.getByTestId("joincall_joincall").click();

  if (mode) {
    await setRtcModeFromSettings(page, mode);
  }

  await switchNoiseSuppressionFromSettings(page);

  await page.getByTestId("lobby_joinCall").click();
  await page.getByRole("radio", { name: "Spotlight" }).check();
}

async function setRtcModeFromSettings(
  page: Page,
  mode: RtcMode,
): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await page.getByText("Developer mode", { exact: true }).check(); // Idempotent:  won't uncheck if already checked

  // Move to Developer tab now
  await page.getByRole("tab", { name: "Developer" }).click();
  if (mode == "legacy") {
    await page.getByText("Legacy: state events").click();
  } else if (mode == "2_0") {
    await page.getByText("Matrix 2.0").click();
  } else {
    // compat
    await page.getByText("Compatibility: state events").click();
  }

  await page.getByTestId("modal_close").click();
}

async function switchNoiseSuppressionFromSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Audio" }).click();
  await page.getByText("Noise suppression", { exact: true }).uncheck();

  // wait for short time before checking the box again
  await page.waitForTimeout(1000);
  await page.getByText("Noise suppression", { exact: true }).check();

  // wait again for a short time
  await page.waitForTimeout(1000);

  await page.getByTestId("modal_close").click();
}

/**
 * Expect a certain number of video tiles to be present and visible.
 */
async function expectVideoTilesCount(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId("videoTile")).toHaveCount(2);

  // There are no other options than to wait for all media to be ready?
  // Or it is too flaky :/
  await page.waitForTimeout(3000);
  // No one should be waiting for media
  await expect(page.getByText("Waiting for media...")).not.toBeVisible();

  // There should be 5 video elements, visible and autoplaying
  const videoElements = await page.locator("video").all();
  expect(videoElements.length).toBe(count);

  const blockDisplayCount = await page
    .locator("video")
    .evaluateAll(
      (videos: Element[]) =>
        videos.filter(
          (v: Element) => window.getComputedStyle(v).display === "block",
        ).length,
    );
  expect(blockDisplayCount).toBe(count);
}

export const SpaHelpers = {
  createCall,
  getCallInviteLink,
  joinCallFromInviteLink,
  expectVideoTilesCount,
};
