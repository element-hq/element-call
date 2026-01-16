/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

test("One to One call using matrix rtc 2.0 aka sticky events", async ({
  browser,
  page,
}) => {
  await page.goto("/");

  await SpaHelpers.createCall(page, "John Doe", "HelloCall", true, "2_0");

  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // Other
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();

  await guestPage.goto("/");

  await SpaHelpers.joinCallFromInviteLink(guestPage, inviteLink);

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);
});
