/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Page } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream=device-count=2",
      "--mute-audio",
    ],
  },
});

test.describe("the camera menu", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Only Chromium offers a second fake camera",
  );

  test("moves the preview to the camera picked, and the call after it", async ({
    page,
  }) => {
    await page.goto("/");
    await SpaHelpers.createCall(page, "Camera user", "Camera switch");
    await expectCamera(page, "fake_device_0");

    await selectCamera(page, "fake_device_1");
    await expectCamera(page, "fake_device_1");

    await page.getByTestId("lobby_joinCall").click();
    await expect(page.getByTestId("name_tag")).toContainText("Camera user");
    await expectCamera(page, "fake_device_1");

    await selectCamera(page, "fake_device_0");
    await expectCamera(page, "fake_device_0");

    // Turning the camera on again opens it anew
    const camera = page.getByTestId("incall_videomute");
    await camera.click();
    await expect(camera).toHaveAttribute("aria-checked", "false");
    await camera.click();
    await expect(camera).toHaveAttribute("aria-checked", "true");
    await expectCamera(page, "fake_device_0");
  });
});

async function selectCamera(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page.getByRole("menuitemradio", { name }).click();
  // Selecting doesn't close the menu, so dismiss it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
}

/** Every video on the page shows this camera, and there is one that does. */
async function expectCamera(page: Page, label: string): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll("video")].flatMap((video) =>
            video.srcObject instanceof MediaStream
              ? video.srcObject.getVideoTracks().map((track) => track.label)
              : [],
          ),
        ),
      ]),
    )
    .toEqual([label]);
}
