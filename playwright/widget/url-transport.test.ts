/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

const sfuUrl = "wss://matrix-rtc.m.localhost/livekit/sfu";

/** Which endpoint a page asks for its SFU tokens. */
type Flow = "cs-api" | "service-legacy" | "service-default";

widgetTest(
  "Call between a url transport and a legacy one",
  async ({ addUser, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );
    test.slow();

    const [host, guest] = await Promise.all([
      addUser("Androl", HOST1),
      addUser("Pevara", HOST1),
    ]);

    // Host advertises a url transport, guest still advertises a legacy one
    await advertiseTransport(host.page, {
      type: "livekit",
      url: sfuUrl,
    });
    // Element Web answers the widget from a cache it filled at login, so make
    // it fetch the transports again now that they are rerouted
    await host.clientHandle.evaluate(async (client) => {
      await client.cachedRtcTransports.refresh();
    });
    const hostFlows = recordFlows(host.page);
    const guestFlows = recordFlows(guest.page);

    const roomName = "Transport Room";
    await TestHelpers.createRoom(roomName, host.page, [guest.mxId]);
    await TestHelpers.acceptRoomInvite(roomName, guest.page);

    await TestHelpers.startCallInCurrentRoom(host.page, false);
    await TestHelpers.joinCallFromLobby(host.page);
    await TestHelpers.joinCallInCurrentRoom(guest.page);

    for (const user of [host, guest]) {
      const frame = user.page
        .locator('iframe[title="Element Call"]')
        .contentFrame();
      await expect(frame.getByTestId("videoTile")).toHaveCount(2, {
        timeout: 10000,
      });
      await expect(frame.getByText("Waiting for media...")).not.toBeVisible({
        timeout: 10000,
      });
      await TestHelpers.expectVisibleVideoCount(frame, 2);
    }

    // Element Web used for Playwright does support MSC4195 for widgets.
    expect(hostFlows).toEqual(new Set(["cs-api", "service-default"]));
    expect(guestFlows).toEqual(new Set(["service-legacy", "cs-api"]));
  },
);

/**
 * Replaces the transports the homeserver advertises to this page, including
 * to the widget host, which fetches them on the widget's behalf. The real
 * response is fetched first so its CORS headers carry over.
 */
async function advertiseTransport(
  page: Page,
  transport: { type: "livekit"; url?: string; livekit_service_url?: string },
): Promise<void> {
  await page.route("**/org.matrix.msc4143/rtc/transports", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { rtc_transports: [transport] } });
  });
}

/** Records which token endpoints the page's widget asks. */
function recordFlows(page: Page): Set<Flow> {
  const flows = new Set<Flow>();
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    const url = request.url();
    if (url.endsWith("/rtc/livekit/get_token")) flows.add("cs-api");
    else if (url.endsWith("/livekit/jwt/sfu/get")) flows.add("service-legacy");
    else if (url.endsWith("/livekit/jwt/get_token"))
      flows.add("service-default");
  });
  return flows;
}
