/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { startPair, tileOf } from "./harness";

test.describe.configure({ timeout: 300_000 });

test("a message sent beside the media reaches the peer, and only the peer", async ({
  browser,
}) => {
  const { pages, users } = await startPair(browser, "sdkdata");
  const [sender, receiver] = pages;
  // Both are in the call before anything is sent, so the receiver knows the
  // sender as a member and does not drop the message
  for (const page of pages)
    await expect(page.getByTestId("member")).toHaveCount(2, {
      timeout: 60_000,
    });
  await expect(tileOf(receiver, users[0])).toBeVisible();

  await sender.getByPlaceholder("message").fill("hello from the SDK");
  await sender.getByRole("button", { name: "Send" }).click();

  const message = receiver.getByTestId("message");
  await expect(message).toHaveText(
    `${users[0].displayName}: hello from the SDK`,
    {
      timeout: 30_000,
    },
  );
  await expect(message).toHaveAttribute("data-topic", "chat");
  await expect(message).toHaveAttribute("data-user-id", users[0].userId);
  // Our own messages are not echoed back
  await expect(sender.getByTestId("message")).toHaveCount(0);
});
