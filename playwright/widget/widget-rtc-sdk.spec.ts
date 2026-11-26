/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type FrameLocator, type Page } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { WIDGET_RTC_SDK_URL } from "./test-helpers.ts";

/**
 * The widget RTC SDK's example widget, `widget-rtc-sdk/index.html`, added to a
 * room as a custom widget and opened in two Element Webs: the bundle's whole
 * public API, from the widget API to the data channel.
 */

widgetTest.describe.configure({ timeout: 300_000 });

const WIDGET_ID = "widget-rtc-sdk-example";
const WIDGET_NAME = "Widget RTC SDK";

/** Accepts the prompts Element Web shows before it runs a widget, and finds it. */
async function openWidget(page: Page): Promise<FrameLocator> {
  // Only for a widget someone else added
  const loadPrompt = page.getByRole("button", { name: "Continue" });
  const capabilitiesPrompt = page.getByRole("button", { name: "Approve" });
  await expect(loadPrompt.or(capabilitiesPrompt)).toBeVisible({
    timeout: 30_000,
  });
  if (await loadPrompt.isVisible()) await loadPrompt.click();
  await capabilitiesPrompt.click({ timeout: 30_000 });
  // The SDK authenticates with the media transport by an OpenID token, and
  // asks for more than one, so the answer has to be remembered
  const openIdPrompt = page.getByRole("dialog", {
    name: "Allow this widget to verify your identity",
  });
  await openIdPrompt.getByText("Remember this").click({ timeout: 30_000 });
  await openIdPrompt.getByRole("button", { name: "Continue" }).click();
  return page.frameLocator(`iframe[title="${WIDGET_NAME}"]`);
}

widgetTest(
  "data sent from one widget arrives in the other",
  async ({ asWidget }) => {
    const { brooks, whistler } = asWidget;

    // Brooks adds the example widget to the room and pins it to the top, so
    // that both Element Webs open it without anyone looking for it
    await brooks.clientHandle.evaluate(
      async (client, { widgetId, name, url }) => {
        const roomId = client
          .getRooms()
          .find((room) => room.name === "Welcome Room")!.roomId;
        await client.sendStateEvent(
          roomId,
          // @ts-expect-error not in the js-sdk's state event map
          "im.vector.modular.widgets",
          {
            id: widgetId,
            type: "m.custom",
            name,
            url,
            data: {},
            creatorUserId: client.getUserId(),
          },
          widgetId,
        );
        await client.sendStateEvent(
          roomId,
          // @ts-expect-error not in the js-sdk's state event map
          "io.element.widgets.layout",
          {
            widgets: {
              [widgetId]: {
                container: "top",
                index: 0,
                width: 100,
                height: 50,
              },
            },
          },
          "",
        );
      },
      {
        widgetId: WIDGET_ID,
        name: WIDGET_NAME,
        // Element Web fills the $ variables in and adds widgetId and parentUrl
        url:
          `${WIDGET_RTC_SDK_URL}/?widgetId=$matrix_widget_id&roomId=$matrix_room_id` +
          "&userId=$matrix_user_id&deviceId=$org.matrix.msc3819.matrix_device_id" +
          "&baseUrl=$org.matrix.msc4039.matrix_base_url",
      },
    );

    const brooksWidget = await openWidget(brooks.page);
    const whistlerWidget = await openWidget(whistler.page);

    // The example joins on load; each sees the other as a member
    for (const [widget, other] of [
      [brooksWidget, whistler],
      [whistlerWidget, brooks],
    ] as const) {
      await expect(widget.locator("#connect_status")).toHaveText("Connected", {
        timeout: 60_000,
      });
      await expect(widget.locator("#members")).toContainText(other.mxId, {
        timeout: 60_000,
      });
    }

    // Data is not queued: the receiver drops what arrives before it has matched
    // the sender on the media transport, which the example does not show. So
    // send until it arrives.
    await expect(async () => {
      await brooksWidget.getByRole("button", { name: "Send Text" }).click();
      await expect(whistlerWidget.locator("#data")).toContainText(
        "Hello, world!",
        { timeout: 2_000 },
      );
    }).toPass({ timeout: 60_000 });
    // Our own data is not echoed back
    await expect(brooksWidget.locator("#data")).not.toContainText(
      "Hello, world!",
    );
  },
);
