/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

test("One to One call using matrix rtc 2.0 aka sticky events", async ({
  browser,
  page,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  await page.goto("/");

  let androlHasSentStickyEvent = false;

  await page.route(
    "**/_matrix/client/v3/rooms/**/send/org.matrix.msc4143.rtc.member/**",
    async (route, req) => {
      androlHasSentStickyEvent = !!new URL(req.url()).searchParams.get(
        "org.matrix.msc4354.sticky_duration_ms",
      );
      return route.continue();
    },
  );

  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");

  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // Other
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();

  await guestPage.goto("/");

  let pevaraHasSentStickyEvent = false;

  await guestPage.route(
    "**/_matrix/client/v3/rooms/**/send/org.matrix.msc4143.rtc.member/**",
    async (route, req) => {
      pevaraHasSentStickyEvent = !!new URL(req.url()).searchParams.get(
        "org.matrix.msc4354.sticky_duration_ms",
      );
      return route.continue();
    },
  );

  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  // Assert both sides have sent sticky membership events
  expect(androlHasSentStickyEvent).toEqual(true);
  expect(pevaraHasSentStickyEvent).toEqual(true);
});
