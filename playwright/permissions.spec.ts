/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";

test("Bug: Unmuting camera when camera permission was not granted was closing the call with an error", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "firefox", "Not passing on CI :/ but ok locally");

  // ===============
  // We cannot use only the clearPermissions API because it doesn't deny the
  // permission, it just resets it to the default state which is "ask".
  // Instead, we override the getUserMedia method to simulate a denial of camera permission.
  // 1. Override getUserMedia to deny video by throwing NotAllowedError
  // 2. Override enumerateDevices to return videoinput devices with empty labels/deviceIds
  await page.addInitScript(() => {
    const mediaDevices = window.navigator.mediaDevices;
    const originalMediaDevice = mediaDevices.getUserMedia.bind(mediaDevices);
    const originalEnumerateDevices =
      mediaDevices.enumerateDevices.bind(mediaDevices);
    window.navigator.mediaDevices.getUserMedia = async (
      constraints?: MediaStreamConstraints,
    ): Promise<MediaStream> => {
      if (constraints?.video) {
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      return originalMediaDevice(constraints);
    };

    window.navigator.mediaDevices.enumerateDevices = async (): Promise<
      MediaDeviceInfo[]
    > => {
      const devices = await originalEnumerateDevices();
      // Filter out video input devices to simulate no camera permission
      return devices.map((device) => {
        if (device.kind === "videoinput") {
          // When we have no permission, the label/deviceId/groupId are empty strings.
          return {
            kind: "videoinput",
            label: "",
            deviceId: "",
            groupId: "",
          } as InputDeviceInfo;
        }
        return device;
      });
    };
  });

  // ===============
  // Start a call then try to unmute camera
  await page.goto("/");

  // Start the call without camera permissio
  await SpaHelpers.createCall(page, "John Doe", "HelloCall", false);

  await page.pause();
  // Video should be muted initially as we have no permission.
  // When muted the aria-label indicates we can start video
  await expect(page.getByRole("button", { name: "Start video" })).toBeVisible();

  await page.getByTestId("lobby_joinCall").click();

  // the test is a bit flaky here, wait for the tile to appear
  await expect(page.getByTestId("videoTile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start video" })).toBeVisible();
  // await page.pause();

  // Try to unmute camera without granting permission
  await page.getByRole("button", { name: "Start video" }).click();

  // There used to have a bug where the call would end with an error here.
  // This was fixed and is not anymore a fatal error.
  await page.waitForTimeout(1000);
  // The call should still be ongoing, but currently the call is ended with an error
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // The video button should still indicate that it is in a muted state.
  // TODO Improve this UI/UX to better inform the user that camera permission is denied.
  await expect(page.getByRole("button", { name: "Start video" })).toBeVisible();
});

test("Should not end call if screen share is cancelled", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "firefox", "Not passing on CI :/ but ok locally");

  // Mock getDisplayMedia to simulate user cancelling the screen share permission dialog
  await page.addInitScript(() => {
    window.navigator.mediaDevices.getDisplayMedia = async (
      options?: DisplayMediaStreamOptions,
    ): Promise<MediaStream> => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // simulate the user clicking cancel on the native window to share selection dialog
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });

  await page.goto("/");

  await SpaHelpers.createCall(page, "John Doe", "HelloCall", false);

  await page.getByTestId("lobby_joinCall").click();
  await expect(page.getByTestId("videoTile")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Share screen" }),
  ).toBeVisible();

  // Start screen sharing which will be denied
  await page.getByRole("button", { name: "Share screen" }).click();

  // There used to have a bug where the call would end with an error here.
  // This was fixed and is not anymore a fatal error.
  await page.waitForTimeout(1000);
  // The call should still be ongoing, but currently the call is ended with an error
  await expect(page.getByText("Something went wrong")).not.toBeVisible();

  // The screen share button should still indicate that screen sharing is not active.
  await expect(
    page.getByRole("button", { name: "Share screen" }),
  ).toBeVisible();
});
