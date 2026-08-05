/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { TestHelpers } from "./test-helpers.ts";

widgetTest.use({ callType: "dm" });

widgetTest(
  "Start a new voice call in DM as widget",
  async ({ asWidget, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );

    const { brooks, whistler } = asWidget;

    await TestHelpers.startCallInCurrentRoom(brooks.page, true);

    await expect(
      brooks.page.locator('iframe[title="Element Call"]'),
    ).toBeVisible();

    const brooksFrame = brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    // We should show a ringing tile, let's check for that
    await expect(
      brooksFrame
        .getByTestId("videoTile")
        .filter({ has: brooksFrame.getByText("Calling…") }),
    ).toBeVisible();

    await expect(whistler.page.getByText("Incoming voice call")).toBeVisible();
    await whistler.page
      .getByRole("alert")
      .getByRole("button", { name: "Join" })
      .click();

    await expect(
      whistler.page.locator('iframe[title="Element Call"]'),
    ).toBeVisible();

    const whistlerFrame = whistler.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // ASSERT the button states for whistler (the callee)
    // video should be off by default in a voice call
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Start video",
        checked: false,
      }),
    ).toBeVisible();
    // audio should be on for the voice call
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Mute microphone",
        checked: true,
      }),
    ).toBeVisible();

    // ASSERT the button states for brools (the caller)
    // video should be off by default in a voice call
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Start video",
        checked: false,
      }),
    ).toBeVisible();
    // audio should be on for the voice call
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Mute microphone",
        checked: true,
      }),
    ).toBeVisible();

    // We confirm that we started in Pip mode (voice call) and check that we still see the composer.
    await expect(
      whistler.page.locator(".mx_BasicMessageComposer"),
    ).toBeVisible();
    await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();

    // ASSERT hanging up on one side ends the call for both
    await brooksFrame.getByRole("button", { name: "End call" }).click();

    // The widget should be closed on both sides
    await expect(
      whistler.page.locator('iframe[title="Element Call"]'),
    ).not.toBeVisible();
    await expect(
      whistler.page.locator('iframe[title="Element Call"]'),
    ).not.toBeVisible();
  },
);

widgetTest(
  "Start a new video call in DM as widget",
  async ({ asWidget, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );

    const { brooks, whistler } = asWidget;

    await TestHelpers.startCallInCurrentRoom(brooks.page, false);

    await expect(
      brooks.page.locator('iframe[title="Element Call"]'),
    ).toBeVisible();

    const brooksFrame = brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // We should show a ringing tile, let's check for that
    await expect(
      brooksFrame
        .getByTestId("videoTile")
        .filter({ has: brooksFrame.getByText(whistler.displayName) })
        .filter({ has: brooksFrame.getByText("Calling…") }),
    ).toBeVisible();

    await expect(whistler.page.getByText("Incoming video call")).toBeVisible();
    await whistler.page
      .getByRole("alert")
      .getByRole("button", { name: "Join" })
      .click();

    await expect(
      whistler.page.locator('iframe[title="Element Call"]'),
    ).toBeVisible();

    const whistlerFrame = whistler.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // ASSERT the button states for whistler (the callee)
    // video should be off by default in a video call
    await expect(
      whistlerFrame.getByRole("switch", { name: "Stop video", checked: true }),
    ).toBeVisible();
    // audio should be on too
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Mute microphone",
        checked: true,
      }),
    ).toBeVisible();

    // ASSERT the button states for brools (the caller)
    // video should be off by default in a video call
    await expect(
      whistlerFrame.getByRole("switch", { name: "Stop video", checked: true }),
    ).toBeVisible();
    // audio should be on too
    await expect(
      whistlerFrame.getByRole("switch", {
        name: "Mute microphone",
        checked: true,
      }),
    ).toBeVisible();

    // In order to confirm that the call is disconnected we will check that the message composer is shown again.
    // So first we need to confirm that it is hidden when in the call.
    await expect(
      whistler.page.locator(".mx_BasicMessageComposer"),
    ).not.toBeVisible();
    await expect(
      brooks.page.locator(".mx_BasicMessageComposer"),
    ).not.toBeVisible();

    // ASSERT hanging up on one side ends the call for both
    await brooksFrame.getByRole("button", { name: "End call" }).click();

    // The widget should be closed on both sides and the timeline should be back on screen
    await expect(
      whistler.page.locator(".mx_BasicMessageComposer"),
    ).toBeVisible();
    await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();
  },
);

widgetTest(
  "Decline a new video call in DM as widget",
  async ({ asWidget, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );

    const { brooks, whistler } = asWidget;

    await TestHelpers.startCallInCurrentRoom(brooks.page, false);

    await expect(
      brooks.page.locator('iframe[title="Element Call"]'),
    ).toBeVisible();

    const brooksFrame = brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // We should show a ringing tile, let's check for that
    await expect(
      brooksFrame
        .getByTestId("videoTile")
        .filter({ has: brooksFrame.getByText(whistler.displayName) })
        .filter({ has: brooksFrame.getByText("Calling…") }),
    ).toBeVisible();

    await expect(whistler.page.getByText("Incoming video call")).toBeVisible();
    await whistler.page.getByRole("button", { name: "Decline" }).click();

    await expect(
      whistler.page.locator('iframe[title="Element Call"]'),
    ).not.toBeVisible();

    // The widget should be closed and the timeline should be back on screen
    await expect(
      brooks.page.locator('iframe[title="Element Call"]'),
    ).not.toBeVisible();

    await expect(
      brooks.page.getByText("This is the beginning of your"),
    ).toBeVisible();
  },
);
