/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { mobileTest } from "../fixtures/fixture-mobile-create.ts";

test("@mobile Start a new call then leave and show the feedback screen", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  // await page.pause();
  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  await page.getByRole("button", { name: "Continue in browser" }).click();
  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // Ensure that the call is connected
  await page
    .locator("div")
    .filter({ hasText: /^HelloCall$/ })
    .click();
  // Check the number of participants
  await expect(page.locator("div").filter({ hasText: /^1$/ })).toBeVisible();
  // The tooltip with the name should be visible
  await expect(page.getByTestId("name_tag")).toContainText("John Doe");

  // leave the call
  await page.getByTestId("incall_leave").click();
  await expect(page.getByRole("heading")).toContainText(
    "John Doe, your call has ended. How did it go?",
  );
  await expect(page.getByRole("main")).toContainText(
    "Why not finish by setting up a password to keep your account?",
  );

  await expect(
    page.getByRole("link", { name: "Not now, return to home screen" }),
  ).toBeVisible();
});

mobileTest(
  "Test earpiece overlay in controlledAudioDevices mode",
  async ({ asMobile, browser }) => {
    test.slow(); // Triples the timeout
    const { creatorPage, inviteLink } = asMobile;

    // ========
    // ACT: The other user use the invite link to join the call as a guest
    // ========
    const guestInviteeContext = await browser.newContext({
      reducedMotion: "reduce",
    });
    const guestPage = await guestInviteeContext.newPage();
    await guestPage.goto(inviteLink + "&controlledAudioDevices=true");

    await guestPage
      .getByRole("button", { name: "Continue in browser" })
      .click();

    await guestPage.getByTestId("joincall_displayName").fill("Invitee");
    await expect(guestPage.getByTestId("joincall_joincall")).toBeVisible();
    await guestPage.getByTestId("joincall_joincall").click();
    await guestPage.getByTestId("lobby_joinCall").click();

    // ========
    // ASSERT: check that there are two members in the call
    // ========

    // There should be two participants now
    await expect(
      guestPage.getByTestId("roomHeader_participants_count"),
    ).toContainText("2");
    expect(await guestPage.getByTestId("videoTile").count()).toBe(2);

    // Same in creator page
    await expect(
      creatorPage.getByTestId("roomHeader_participants_count"),
    ).toContainText("2");
    expect(await creatorPage.getByTestId("videoTile").count()).toBe(2);

    // TEST: control audio devices from the invitee page

    await guestPage.evaluate(() => {
      window.controls.setAvailableAudioDevices([
        { id: "speaker", name: "Speaker", isSpeaker: true },
        { id: "earpiece", name: "Handset", isEarpiece: true },
        { id: "headphones", name: "Headphones" },
      ]);
      window.controls.setAudioDevice("earpiece");
    });
    await expect(
      guestPage.getByRole("heading", { name: "Handset Mode" }),
    ).toBeVisible();
    await expect(
      guestPage.getByRole("button", { name: "Back to Speaker Mode" }),
    ).toBeVisible();

    // Should auto-mute the video when earpiece is selected
    await expect(guestPage.getByTestId("incall_videomute")).toBeDisabled();
  },
);
