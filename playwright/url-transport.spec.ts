/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

const sfuUrl = "wss://matrix-rtc.m.localhost/livekit/sfu";
const serviceUrl = "https://matrix-rtc.m.localhost/livekit/jwt";

interface Transport {
  type: "livekit";
  url?: string;
  livekit_service_url?: string;
}

/**
 * The transport shapes a homeserver may advertise while migrating to the
 * latest MSC4195. `legacy` is what the e2e Synapse advertises on its own.
 */
const shapes = {
  url: { type: "livekit", url: sfuUrl },
  both: { type: "livekit", url: sfuUrl, livekit_service_url: serviceUrl },
  legacy: null,
} satisfies Record<string, Transport | null>;
type Shape = keyof typeof shapes;

/** Which endpoint a page asks for its SFU tokens. */
type Flow = "cs-api" | "service-legacy" | "service-default";

const pairs: [host: Shape, guest: Shape][] = [
  ["url", "url"],
  ["both", "both"],
  ["url", "legacy"],
];

for (const [hostShape, guestShape] of pairs) {
  test(`One to one call with ${hostShape} host and ${guestShape} guest transport`, async ({
    browser,
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );

    await advertiseTransport(page, shapes[hostShape]);
    const hostRequests = recordAuthRequests(page);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");
    const inviteLink = await SpaHelpers.getCallInviteLink(page);

    const guestContext = await browser.newContext({ reducedMotion: "reduce" });
    const guestPage = await guestContext.newPage();
    await advertiseTransport(guestPage, shapes[guestShape]);
    const guestRequests = recordAuthRequests(guestPage);
    await SpaHelpers.joinCallFromInviteLink(
      guestPage,
      inviteLink,
      "Pevara",
      "2_0",
    );

    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);

    expect(hostRequests.flows).toEqual(expectedFlows(hostShape, guestShape));
    expect(guestRequests.flows).toEqual(expectedFlows(guestShape, hostShape));
    for (const requests of [hostRequests, guestRequests]) {
      for (const url of requests.csApiUrls) expect(url).toBe(sfuUrl);
    }
  });
}

/**
 * A page publishes on its own transport and subscribes on every other
 * transport in the call, so the flows it uses depend on both shapes.
 */
function expectedFlows(own: Shape, peer: Shape): Set<Flow> {
  const flows = new Set<Flow>([publishFlow(own)]);
  if (peer !== own) flows.add(subscribeFlow(peer));
  return flows;
}

function publishFlow(shape: Shape): Flow {
  return shape === "legacy" ? "service-legacy" : "cs-api";
}

function subscribeFlow(shape: Shape): Flow {
  return shape === "legacy" ? "service-default" : "cs-api";
}

/**
 * Replaces the transports the homeserver advertises to this page. The real
 * response is fetched first so its CORS headers carry over.
 */
async function advertiseTransport(
  page: Page,
  transport: Transport | null,
): Promise<void> {
  if (transport === null) return;
  await page.route("**/org.matrix.msc4143/rtc/transports", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { rtc_transports: [transport] } });
  });
}

interface AuthRequests {
  flows: Set<Flow>;
  /** The `url` field of every request to the MSC4195 `get_token` endpoint. */
  csApiUrls: string[];
}

function recordAuthRequests(page: Page): AuthRequests {
  const requests: AuthRequests = { flows: new Set(), csApiUrls: [] };
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const url = request.url();
    if (url.endsWith("/rtc/livekit/get_token")) {
      requests.flows.add("cs-api");
      requests.csApiUrls.push((request.postDataJSON() as { url: string }).url);
    } else if (url.endsWith("/livekit/jwt/sfu/get")) {
      requests.flows.add("service-legacy");
    } else if (url.endsWith("/livekit/jwt/get_token")) {
      requests.flows.add("service-default");
    }
  });
  return requests;
}
