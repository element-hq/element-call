/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  type Page,
  test,
  type Request,
  type Browser,
} from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

async function setupTwoUserSpaCall(
  browser: Browser,
  page: Page,
  browserName: string,
): Promise<{ guestPage: Page }> {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  await page.goto("/");

  let androlHasSentStickyEvent = false;
  const androlResolver = Promise.withResolvers<void>();
  await interceptEventSend(
    page,
    // This room is not encrypted, so the event is sent in clear
    "org.matrix.msc4143.rtc.member",
    (req) => {
      androlHasSentStickyEvent =
        androlHasSentStickyEvent || isStickySend(req.url());
      androlResolver.resolve();
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

  const pevaraResolver = Promise.withResolvers<void>();
  await interceptEventSend(
    guestPage,
    // This room is not encrypted, so the event is sent in clear
    "org.matrix.msc4143.rtc.member",
    (req) => {
      pevaraHasSentStickyEvent =
        pevaraHasSentStickyEvent || isStickySend(req.url());
      pevaraResolver.resolve();
    },
  );

  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );
  // Assert both sides have sent sticky membership events
  await androlResolver.promise;
  expect(androlHasSentStickyEvent).toEqual(true);
  await pevaraResolver.promise;
  expect(pevaraHasSentStickyEvent).toEqual(true);

  return { guestPage };
}

test("One to One call using matrix rtc 2.0 aka sticky events", async ({
  browser,
  page,
  browserName,
}) => {
  const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);
});

// This issue occurs when a member leave but does not clean up their sticky event.
// If they rejoin they will use a new stickye key (stickyKey = member.id = UUID())
// We end up with two memberships with the same user and device id. This previously
// was a impossible case since that would be the same state event. Now its possible.
// We need to ALWAYS key by userId, deviceId and member.id. This test checks that.
test("One to One rejoin after improper leave does not crash EC", async ({
  browser,
  page,
  browserName,
}) => {
  const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  await guestPage.reload();
  await expect(guestPage.getByTestId("lobby_joinCall")).toBeVisible();

  // Check if rejoining with the same browser context (device) breaks EC.
  // This has happened on versions that do not consider the member.id as part of the key for a media tile.
  await guestPage.getByTestId("lobby_joinCall").click();

  // We cannot use the `expectVideoTilesCount` helper here since one of them is expected to show waiting for media
  await expect(page.getByTestId("videoTile")).toHaveCount(3, {
    timeout: 10000,
  });
  await expect(guestPage.getByTestId("videoTile")).toHaveCount(2, {
    timeout: 10000,
  });
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
