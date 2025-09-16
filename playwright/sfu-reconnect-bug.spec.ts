/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("When creator left, avoid reconnect to the same SFU", async ({
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
  const guestB = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestBPage = await guestB.newPage();

  await guestBPage.goto(inviteLink);
  await guestBPage.getByTestId("joincall_displayName").fill("Invitee");
  await expect(guestBPage.getByTestId("joincall_joincall")).toBeVisible();
  await guestBPage.getByTestId("joincall_joincall").click();
  await guestBPage.getByTestId("lobby_joinCall").click();
  await guestBPage.getByRole("radio", { name: "Spotlight" }).check();

  // ========
  // ACT: add a third user to the call to reproduce the bug
  // ========
  const guestC = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestCPage = await guestC.newPage();
  let sfuGetCallCount = 0;
  await guestCPage.route("**/livekit/jwt/sfu/get", async (route) => {
    sfuGetCallCount++;
    await route.continue();
  });
  // Track WebSocket connections
  let wsConnectionCount = 0;
  await guestCPage.routeWebSocket("**", (ws) => {
    // For some reason the interception is not working with the **
    if (ws.url().includes("livekit/sfu/rtc")) {
      wsConnectionCount++;
    }
    ws.connectToServer();
  });

  await guestCPage.goto(inviteLink);
  await guestCPage.getByTestId("joincall_displayName").fill("Invitee");
  await expect(guestCPage.getByTestId("joincall_joincall")).toBeVisible();
  await guestCPage.getByTestId("joincall_joincall").click();
  await guestCPage.getByTestId("lobby_joinCall").click();
  await guestCPage.getByRole("radio", { name: "Spotlight" }).check();

  await guestCPage.waitForTimeout(1000);

  // ========
  // the creator leaves the call
  await creatorPage.getByTestId("incall_leave").click();

  await guestCPage.waitForTimeout(2000);
  // https://github.com/element-hq/element-call/issues/3344
  // The app used to request a new jwt token then to reconnect to the SFU
  expect(wsConnectionCount).toBe(1);
  expect(sfuGetCallCount).toBe(2 /* the first one is for the warmup */);
});
