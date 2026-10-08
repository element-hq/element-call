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

const cases: {
  hostShape: Shape;
  guestShape: Shape;
  hostFlows: Flow[];
  guestFlows: Flow[];
}[] = [
  {
    hostShape: "url",
    guestShape: "url",
    hostFlows: ["cs-api"],
    guestFlows: ["cs-api"],
  },
  {
    hostShape: "both",
    guestShape: "both",
    hostFlows: ["cs-api"],
    guestFlows: ["cs-api"],
  },
  {
    hostShape: "url",
    guestShape: "legacy",
    hostFlows: ["cs-api", "service-default"],
    guestFlows: ["service-legacy", "cs-api"],
  },
];

for (const { hostShape, guestShape, hostFlows, guestFlows } of cases) {
  test(`One to one call with ${hostShape} host and ${guestShape} guest transport`, async ({
    browser,
    page,
    browserName,
  }) => {
    skipOnFirefox(browserName);

    // The host starts the call.
    await advertiseTransport(page, shapes[hostShape]);
    const hostRequests = recordAuthRequests(page);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");
    const inviteLink = await SpaHelpers.getCallInviteLink(page);

    // The guest joins.
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

    // Wait for the call to connect and render.
    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);

    // The host and guest ran through the expected flows.
    expect(flowsOf(hostRequests)).toEqual(new Set(hostFlows));
    expect(flowsOf(guestRequests)).toEqual(new Set(guestFlows));

    // All requests succeeded and the SFU URL was set on C-S requests.
    for (const request of [...hostRequests, ...guestRequests]) {
      expect(request.status).toBe(200);
      if (request.flow === "cs-api") expect(request.sfuUrl).toBe(sfuUrl);
    }
  });
}

test("Subscriber falls back to the JWT service when the homeserver lacks MSC4195", async ({
  browser,
  page,
  browserName,
}) => {
  skipOnFirefox(browserName);

  // The host starts the call with both transport shapes.
  await advertiseTransport(page, shapes.both);
  await page.goto("/");
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");
  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // The guest joins but their C-S requests fail.
  const guestContext = await browser.newContext({ reducedMotion: "reduce" });
  const guestPage = await guestContext.newPage();
  await rejectCsApiTokens(guestPage);
  const guestRequests = recordAuthRequests(guestPage);
  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );

  // Wait for the call to connect and render.
  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  // The guest ran through all flows.
  expect(flowsOf(guestRequests)).toEqual(
    new Set<Flow>(["cs-api", "service-legacy", "service-default"]),
  );

  // The C-S token requests failed.
  for (const request of guestRequests) {
    expect(request.status).toBe(request.flow === "cs-api" ? 404 : 200);
  }

  // The C-S token requests preceeded the fallback request.
  const flows = guestRequests.map((r) => r.flow);
  expect(flows.indexOf("service-default")).toBeGreaterThan(
    flows.indexOf("cs-api"),
  );
});

test("Publisher shows an error when the homeserver lacks MSC4195", async ({
  page,
  browserName,
}) => {
  skipOnFirefox(browserName);

  // The host tries to start a call with only the C-S transport shape available but
  // their C-S requests fail.
  await advertiseTransport(page, shapes.url);
  await rejectCsApiTokens(page);
  await page.goto("/");
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");

  // We land on an error page.
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The authorization service for your media server (SFU) is out of date.",
    ),
  ).toBeVisible();
});

test("Delegated leave on a url transport ends the membership when the guest drops", async ({
  browser,
  page,
  browserName,
}) => {
  skipOnFirefox(browserName);

  // The host starts the call.
  await advertiseTransport(page, shapes.url);
  await page.goto("/");
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");
  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // The guest joins.
  const guestContext = await browser.newContext({ reducedMotion: "reduce" });
  const guestPage = await guestContext.newPage();
  await advertiseTransport(guestPage, shapes.url);
  const delayedLeave = recordDelayedLeave(guestPage);
  const delegations = recordDelegations(guestPage);
  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );

  // Wait for the call to connect and render.
  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  // The guest handed its delayed leave to the homeserver, after probing it for
  // delegation support with bodiless requests.
  await expect
    .poll(() => delegations.at(-1))
    .toEqual({ status: 200, sfuUrl, delayId: delayedLeave.delayId });
  const probes = delegations.slice(0, -1);
  expect(probes.length).toBeGreaterThan(0);
  for (const probe of probes) expect(probe).toEqual({ status: 401 });

  // The delay is long enough that a leave within the window below cannot come
  // from the delayed event expiring on its own.
  expect(delayedLeave.delayMs).toBeGreaterThan(60_000);

  // The guest drops without leaving.
  await guestPage.reload();

  // The host eventually sees the guest go once the delayed event fires.
  await expect(page.getByTestId("videoTile")).toHaveCount(1, {
    timeout: 30_000,
  });
});

function skipOnFirefox(browserName: string): void {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );
}

/**
 * Maps recorded requests to a set of flows. Publisher and subscriber connections
 * start concurrently so using arrays for comparison isn't convenient.
 */
function flowsOf(requests: AuthRequest[]): Set<Flow> {
  return new Set(requests.map((r) => r.flow));
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

/**
 * Makes the homeserver look like one without MSC4195: its `get_token`
 * endpoint answers as Synapse does for an unknown route.
 */
async function rejectCsApiTokens(page: Page): Promise<void> {
  await page.route("**/rtc/livekit/get_token", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 404,
      json: { errcode: "M_UNRECOGNIZED", error: "Unrecognized request" },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
}

/** A recorded delayed leave event. */
interface DelayedLeave {
  delayMs?: number;
  delayId?: string;
}

/** Records the delayed leave event the page schedules on joining. */
function recordDelayedLeave(page: Page): DelayedLeave {
  const delayedLeave: DelayedLeave = {};
  page.on("response", (response) => {
    const delay = new URL(response.request().url()).searchParams.get(
      "org.matrix.msc4140.delay",
    );
    if (delay === null || response.status() !== 200) return;
    delayedLeave.delayMs = Number(delay);
    response
      .json()
      .then((body: { delay_id: string }) => {
        delayedLeave.delayId = body.delay_id;
      })
      .catch(() => {});
  });
  return delayedLeave;
}

/** A recorded delegation request for a delayed leave event. */
interface Delegation {
  status: number;
  sfuUrl?: string;
  delayId?: string;
}

/** Records requests to the MSC4195 `delegate_delayed_leave` endpoint. */
function recordDelegations(page: Page): Delegation[] {
  const delegations: Delegation[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (
      request.method() !== "POST" ||
      !request.url().endsWith("/rtc/livekit/delegate_delayed_leave")
    )
      return;
    const body = request.postDataJSON() as {
      url: string;
      delay_id: string;
    } | null;
    delegations.push({
      status: response.status(),
      ...(body && { sfuUrl: body.url, delayId: body.delay_id }),
    });
  });
  return delegations;
}

/** A recorded token request. */
interface AuthRequest {
  flow: Flow;
  status: number;
  /** The SFU a request to the MSC4195 `get_token` endpoint asked for. */
  sfuUrl?: string;
}

/** Records token requests. */
function recordAuthRequests(page: Page): AuthRequest[] {
  const requests: AuthRequest[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    const url = request.url();
    if (url.endsWith("/rtc/livekit/get_token")) {
      requests.push({
        flow: "cs-api",
        status: response.status(),
        sfuUrl: (request.postDataJSON() as { url: string }).url,
      });
    } else if (url.endsWith("/livekit/jwt/sfu/get")) {
      requests.push({ flow: "service-legacy", status: response.status() });
    } else if (url.endsWith("/livekit/jwt/get_token")) {
      requests.push({ flow: "service-default", status: response.status() });
    }
  });
  return requests;
}
