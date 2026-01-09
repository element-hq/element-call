/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";

widgetTest.use({callType: "dm"});

widgetTest("Start a new voice call in DM as widget", async ({ asWidget }) => {
  test.slow(); // Triples the timeout

  const { brooks, whistler } = asWidget;

  await expect(
    brooks.page.getByRole("button", { name: "Voice call" }),
  ).toBeVisible();
  await brooks.page.getByRole("button", { name: "Voice call" }).click();

  await expect(
    brooks.page.getByRole("menuitem", { name: "Element Call" }),
  ).toBeVisible();

  await brooks.page.getByRole("menuitem", { name: "Element Call" }).click();

  await expect(
    brooks.page
      .locator('iframe[title="Element Call"]')
  ).toBeVisible();

  const brooksFrame = brooks.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  // We should show a ringing overlay, let's check for that
  await expect(brooksFrame.getByText(`Waiting for ${whistler.displayName} to join…`)).toBeVisible();


  await expect(whistler.page.getByText('Incoming voice call')).toBeVisible();
  await whistler.page.getByRole('button', { name: 'Accept' }).click();

  await expect(
    whistler.page
      .locator('iframe[title="Element Call"]')
  ).toBeVisible();

  const whistlerFrame = whistler.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  // ASSERT the button states for whistler (the callee)
  {
    // The only way to know if it is muted or not is to look at the data-kind attribute..
    const videoButton = whistlerFrame.getByTestId('incall_videomute');
    // video should be off by default in a voice call
    await expect(videoButton).toHaveAttribute("aria-label", /^Start video$/);


    const audioButton = whistlerFrame.getByTestId('incall_mute');
    // audio should be on for the voice call
    await expect(audioButton).toHaveAttribute("aria-label", /^Mute microphone$/);
  }

  // ASSERT the button states for brools (the caller)
  {
    // The only way to know if it is muted or not is to look at the data-kind attribute..
    const videoButton = brooksFrame.getByTestId('incall_videomute');
    // video should be off by default in a voice call
    await expect(videoButton).toHaveAttribute("aria-label", /^Start video$/);


    const audioButton = brooksFrame.getByTestId('incall_mute');
    // audio should be on for the voice call
    await expect(audioButton).toHaveAttribute("aria-label", /^Mute microphone$/);
  }

  // In order to confirm that the call is disconnected we will check that the message composer is shown again.
  // So first we need to confirm that it is hidden when in the call.
  await expect(whistler.page.locator(".mx_BasicMessageComposer")).not.toBeVisible();
  await expect(brooks.page.locator(".mx_BasicMessageComposer")).not.toBeVisible();

  // ASSERT hanging up on one side ends the call for both
  {
    const hangupButton = brooksFrame.getByTestId('incall_leave');
    await hangupButton.click();
  }

  // The widget should be closed on both sides and the timeline should be back on screen
  await expect(whistler.page.locator(".mx_BasicMessageComposer")).toBeVisible();
  await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();

});



widgetTest("Start a new video call in DM as widget", async ({ asWidget, browserName }) => {
  test.slow(); // Triples the timeout

  const { brooks, whistler } = asWidget;

  await expect(
    brooks.page.getByRole("button", { name: "Video call" }),
  ).toBeVisible();
  await brooks.page.getByRole("button", { name: "Video call" }).click();

  await expect(
    brooks.page.getByRole("menuitem", { name: "Element Call" }),
  ).toBeVisible();

  await brooks.page.getByRole("menuitem", { name: "Element Call" }).click();

  await expect(
    brooks.page
      .locator('iframe[title="Element Call"]')
  ).toBeVisible();

  const brooksFrame = brooks.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  // We should show a ringing overlay, let's check for that
  await expect(brooksFrame.getByText(`Waiting for ${whistler.displayName} to join…`)).toBeVisible();


  await expect(whistler.page.getByText('Incoming video call')).toBeVisible();
  await whistler.page.getByRole('button', { name: 'Accept' }).click();

  await expect(
    whistler.page
      .locator('iframe[title="Element Call"]')
  ).toBeVisible();

  const whistlerFrame = whistler.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  // ASSERT the button states for whistler (the callee)
  {
    // The only way to know if it is muted or not is to look at the data-kind attribute..
    const videoButton = whistlerFrame.getByTestId('incall_videomute');
    // video should be on by default in a voice call
    await expect(videoButton).toHaveAttribute("aria-label", /^Stop video$/);


    const audioButton = whistlerFrame.getByTestId('incall_mute');
    // audio should be on for the voice call
    await expect(audioButton).toHaveAttribute("aria-label", /^Mute microphone$/);
  }

  // ASSERT the button states for brools (the caller)
  {
    // The only way to know if it is muted or not is to look at the data-kind attribute..
    const videoButton = brooksFrame.getByTestId('incall_videomute');
    // video should be on by default in a voice call
    await expect(videoButton).toHaveAttribute("aria-label", /^Stop video$/);


    const audioButton = brooksFrame.getByTestId('incall_mute');
    // audio should be on for the voice call
    await expect(audioButton).toHaveAttribute("aria-label", /^Mute microphone$/);
  }

  // In order to confirm that the call is disconnected we will check that the message composer is shown again.
  // So first we need to confirm that it is hidden when in the call.
  await expect(whistler.page.locator(".mx_BasicMessageComposer")).not.toBeVisible();
  await expect(brooks.page.locator(".mx_BasicMessageComposer")).not.toBeVisible();

  // ASSERT hanging up on one side ends the call for both
  {
    const hangupButton = brooksFrame.getByTestId('incall_leave');
    await hangupButton.click();
  }

  // The widget should be closed on both sides and the timeline should be back on screen
  await expect(whistler.page.locator(".mx_BasicMessageComposer")).toBeVisible();
  await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();

});

