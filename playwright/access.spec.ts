/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("Sign up a new account, then login, then logout", async ({ browser }) => {
  const userId = `test_user-id_${Date.now()}`;

  const newUserContext = await browser.newContext();
  const newUserPage = await newUserContext.newPage();
  await newUserPage.goto("/");

  await expect(newUserPage.getByTestId("home_register")).toBeVisible();
  await newUserPage.getByTestId("home_register").click();

  await newUserPage.getByTestId("register_username").click();
  await newUserPage.getByTestId("register_username").fill(userId);

  await newUserPage.getByTestId("register_password").click();
  await newUserPage.getByTestId("register_password").fill("password1!");
  await newUserPage.getByTestId("register_confirm_password").click();
  await newUserPage.getByTestId("register_confirm_password").fill("password1!");
  await newUserPage.getByTestId("register_register").click();

  await expect(
    newUserPage.getByRole("heading", { name: "Start new call" }),
  ).toBeVisible();

  // Now use a new page to login this account
  const returningUserContext = await browser.newContext();
  const returningUserPage = await returningUserContext.newPage();
  await returningUserPage.goto("/");

  await expect(returningUserPage.getByTestId("home_login")).toBeVisible();
  await returningUserPage.getByTestId("home_login").click();
  await returningUserPage.getByTestId("login_username").click();
  await returningUserPage.getByTestId("login_username").fill(userId);
  await returningUserPage.getByTestId("login_password").click();
  await returningUserPage.getByTestId("login_password").fill("password1!");
  await returningUserPage.getByTestId("login_login").click();

  await expect(
    returningUserPage.getByRole("heading", { name: "Start new call" }),
  ).toBeVisible();

  // logout
  await returningUserPage.getByTestId("usermenu_open").click();
  await returningUserPage.locator('[data-testid="usermenu_logout"]').click();

  await expect(
    returningUserPage.getByRole("link", { name: "Log In" }),
  ).toBeVisible();
  await expect(returningUserPage.getByTestId("home_login")).toBeVisible();
});

test("As a guest, create a call, share link and other join", async ({
  browser,
}) => {
  // Use reduce motion to disable animations that are making the tests a bit flaky
  const creatorContext = await browser.newContext({ reducedMotion: "reduce" });
  const creatorPage = await creatorContext.newPage();

  await creatorPage.goto("/");

  // ========
  // ARRANGE: The first user creates a call as guest, join it, then click the invite button to copy the invite link
  // ========
  await creatorPage.getByTestId("home_callName").click();
  await creatorPage.getByTestId("home_callName").fill("Welcome");
  await creatorPage.getByTestId("home_displayName").click();
  await creatorPage.getByTestId("home_displayName").fill("Inviter");
  await creatorPage.getByTestId("home_go").click();
  await expect(creatorPage.locator("video")).toBeVisible();

  // join
  await creatorPage.getByTestId("lobby_joinCall").click();
  // Spotlight mode to make checking the test visually clearer
  await creatorPage.getByRole("radio", { name: "Spotlight" }).check();

  // Get the invite link
  await creatorPage.getByRole("button", { name: "Invite" }).click();
  await expect(
    creatorPage.getByRole("heading", { name: "Invite to this call" }),
  ).toBeVisible();
  await expect(creatorPage.getByRole("img", { name: "QR Code" })).toBeVisible();
  await expect(creatorPage.getByTestId("modal_inviteLink")).toBeVisible();
  await expect(creatorPage.getByTestId("modal_inviteLink")).toBeVisible();
  await creatorPage.getByTestId("modal_inviteLink").click();

  const inviteLink = (await creatorPage.evaluate(
    "navigator.clipboard.readText()",
  )) as string;
  expect(inviteLink).toContain("room/#/");

  // ========
  // ACT: The other user use the invite link to join the call as a guest
  // ========
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();

  await guestPage.goto(inviteLink);
  await guestPage.getByTestId("joincall_displayName").fill("Invitee");
  await expect(guestPage.getByTestId("joincall_joincall")).toBeVisible();
  await guestPage.getByTestId("joincall_joincall").click();
  await guestPage.getByTestId("lobby_joinCall").click();
  await guestPage.getByRole("radio", { name: "Spotlight" }).check();

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

  // XXX check the display names on the video tiles
});
