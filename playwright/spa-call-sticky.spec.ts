/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page, test, type Request } from "@playwright/test";

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

  await interceptEventSend(page, "org.matrix.msc4143.rtc.member", (req) => {
    androlHasSentStickyEvent =
      androlHasSentStickyEvent || isStickySend(req.url());
  });

  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");

  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // Other
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();

  await guestPage.goto("/");

  let pevaraHasSentStickyEvent = false;

  await interceptEventSend(
    guestPage,
    "org.matrix.msc4143.rtc.member",
    (req) => {
      pevaraHasSentStickyEvent =
        pevaraHasSentStickyEvent || isStickySend(req.url());
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

function isStickySend(url: string): boolean {
  return !!new URL(url).searchParams.get(
    "org.matrix.msc4354.sticky_duration_ms",
  );
}

async function interceptEventSend(
  page: Page,
  eventType: string,
  callback: (request: Request) => void,
): Promise<void> {
  await page.route(
    `**/_matrix/client/v3/rooms/**/send/${eventType}/**`,
    async (route, req) => {
      callback(req);
      return route.continue();
    },
  );
}
