/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Browser, type Page, test, expect } from "@playwright/test";

export interface MobileCreateFixtures {
  asMobile: {
    creatorPage: Page;
    inviteLink: string;
  };
}

export const mobileTest = test.extend<MobileCreateFixtures>({
  asMobile: async ({ browser }, pUse) => {
    const fixtures = await createCallAndInvite(browser);
    await pUse({
      creatorPage: fixtures.page,
      inviteLink: fixtures.inviteLink,
    });
  },
});

/**
 * Create a call and generate an invite link
 */
async function createCallAndInvite(
  browser: Browser,
): Promise<{ page: Page; inviteLink: string }> {
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

  await creatorPage
    .getByRole("button", { name: "Continue in browser" })
    .click();
  // join
  await creatorPage.getByTestId("lobby_joinCall").click();

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

  return {
    page: creatorPage,
    inviteLink,
  };
}
