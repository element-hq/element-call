/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";
import { type RtcMode } from "./widget/test-helpers.ts";

const sfuUrl = "wss://matrix-rtc.m.localhost/livekit/sfu";
const serviceUrl = "https://matrix-rtc.m.localhost/livekit/jwt";

const otherHomeserver = {
  base_url: "https://synapse.othersite.m.localhost",
  server_name: "synapse.othersite.m.localhost",
};
const otherSfuUrl = "wss://matrix-rtc.othersite.m.localhost/livekit/sfu";

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
  "url+legacy": {
    type: "livekit",
    url: sfuUrl,
    livekit_service_url: serviceUrl,
  },
  legacy: null,
} satisfies Record<string, Transport | null>;
type Shape = keyof typeof shapes;

/** Which endpoint a page asks for its SFU tokens. */
type Flow = "cs-api" | "service-legacy" | "service-default";

const cases: {
  hostShape: Shape;
  guestShape: Shape;
  /** The MatrixRTC mode both sides use; the default is compatibility mode. */
  mode?: RtcMode;
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
    // Publishers keep the legacy participant identity that clients predating
    // MSC4195 expect, which only the JWT service assigns.
    hostShape: "url+legacy",
    guestShape: "url+legacy",
    hostFlows: ["service-legacy"],
    guestFlows: ["service-legacy"],
  },
  {
    // The MatrixRTC mode has no bearing on the choice.
    hostShape: "url+legacy",
    guestShape: "url+legacy",
    mode: "2_0",
    hostFlows: ["service-legacy"],
    guestFlows: ["service-legacy"],
  },
  {
    hostShape: "url",
    guestShape: "legacy",
    hostFlows: ["cs-api", "service-default"],
    guestFlows: ["service-legacy", "cs-api"],
  },
  {
    hostShape: "url",
    guestShape: "url+legacy",
    hostFlows: ["cs-api", "service-default"],
    guestFlows: ["service-legacy", "cs-api"],
  },
];

for (const { hostShape, guestShape, mode, hostFlows, guestFlows } of cases) {
  test(`One to one call with ${hostShape} host and ${guestShape} guest transport${mode === "2_0" ? " in Matrix 2.0 mode" : ""}`, async ({
    browser,
    page,
    browserName,
  }) => {
    skipOnFirefox(browserName);

    // The host starts the call.
    await advertiseTransport(page, shapes[hostShape]);
    const hostRequests = recordAuthRequests(page);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Androl", "HelloCall", true, mode);
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
      mode,
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
      // Clients predating MSC4195 match a publisher by the legacy identity,
      // which only the JWT service's legacy endpoint assigns. The other flows
      // hash it.
      expect(request.identity).toMatch(
        request.flow === "service-legacy" ? legacyIdentity : hashedIdentity,
      );
    }
  });
}

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
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true);

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

test("Group call with all possible transport shapes at once", async ({
  browser,
  page,
  browserName,
}) => {
  skipOnFirefox(browserName);

  // The host starts the call with a url transport.
  await advertiseTransport(page, shapes.url);
  await page.goto("/");
  await SpaHelpers.createCall(page, "Alice", "HelloCall", true);
  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // The guest with a legacy transport joins.
  const bobContext = await browser.newContext({ reducedMotion: "reduce" });
  const bobPage = await bobContext.newPage();
  await advertiseTransport(bobPage, shapes.legacy);
  await SpaHelpers.joinCallFromInviteLink(bobPage, inviteLink, "Bob");

  // The guest with a url+legacy transport joins.
  const carolContext = await browser.newContext({ reducedMotion: "reduce" });
  const carolPage = await carolContext.newPage();
  await advertiseTransport(carolPage, shapes["url+legacy"]);
  await SpaHelpers.joinCallFromInviteLink(carolPage, inviteLink, "Carol");

  // Wait for the call to connect and render.
  await SpaHelpers.expectVideoTilesCount(page, 3);
  await SpaHelpers.expectVideoTilesCount(bobPage, 3);
  await SpaHelpers.expectVideoTilesCount(carolPage, 3);
});

/**
 * Delegation follows the flow that authenticated the publisher: the homeserver
 * for a `url`-only transport, the JWT service wherever there is one.
 */
const delegationCases: { shape: Shape; via: Delegation["via"] }[] = [
  { shape: "url", via: "homeserver" },
  { shape: "legacy", via: "service" },
  { shape: "url+legacy", via: "service" },
];

for (const { shape, via } of delegationCases) {
  test(`Delayed leave event delegated through the ${via} for a ${shape} transport gets sent on disconnect`, async ({
    browser,
    page,
    browserName,
  }) => {
    skipOnFirefox(browserName);

    // The host starts the call.
    await advertiseTransport(page, shapes[shape]);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Androl", "HelloCall", true);
    const inviteLink = await SpaHelpers.getCallInviteLink(page);

    // The guest joins.
    const guestContext = await browser.newContext({ reducedMotion: "reduce" });
    const guestPage = await guestContext.newPage();
    await advertiseTransport(guestPage, shapes[shape]);
    const delayedLeave = recordDelayedLeave(guestPage);
    const delegations = recordDelegations(guestPage);
    await SpaHelpers.joinCallFromInviteLink(guestPage, inviteLink, "Pevara");

    // Wait for the call to connect and render.
    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);

    // The guest handed its delayed leave over, after probing for delegation
    // support with bodiless requests, which count as supported unless they
    // 404. The homeserver is always probed; the JWT service only when there
    // is one.
    await expect
      .poll(() => delegations.at(-1))
      .toEqual({
        via,
        status: 200,
        delayId: delayedLeave.delayId,
        ...(via === "homeserver" && { sfuUrl }),
      });
    const probes = delegations.slice(0, -1);
    expect(probes.some((probe) => probe.via === via)).toBe(true);
    for (const probe of probes) {
      expect(probe.status).toBeGreaterThanOrEqual(400);
      expect(probe.status).not.toBe(404);
    }

    // The delay is long enough that a leave within the window below cannot
    // come from the delayed event expiring on its own.
    expect(delayedLeave.delayMs).toBeGreaterThan(60_000);

    // The guest drops without leaving.
    await guestPage.reload();

    // The host eventually sees the guest go once the delayed event fires.
    await expect(page.getByTestId("videoTile")).toHaveCount(1, {
      timeout: 30_000,
    });
  });
}

test("Subscribers get tokens for a remote homeserver's SFU over federation", async ({
  browser,
  page,
  browserName,
}) => {
  skipOnFirefox(browserName);

  // The host lives on the other homeserver and publishes on its SFU.
  await useHomeserver(page, otherHomeserver);
  await advertiseTransport(page, { type: "livekit", url: otherSfuUrl });
  const hostRequests = recordAuthRequests(page);
  await page.goto("/");
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true);
  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // The guest lives on the default homeserver and joins over federation.
  const guestContext = await browser.newContext({ reducedMotion: "reduce" });
  const guestPage = await guestContext.newPage();
  await advertiseTransport(guestPage, shapes.url);
  const guestRequests = recordAuthRequests(guestPage);
  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    `${inviteLink}&viaServers=${otherHomeserver.server_name}`,
    "Pevara",
  );

  // Wait for the call to connect and render.
  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  // Each side got a token for its own SFU and for the other side's SFU, all
  // through its own homeserver.
  for (const requests of [hostRequests, guestRequests]) {
    expect(flowsOf(requests)).toEqual(new Set<Flow>(["cs-api"]));
    expect(new Set(requests.map((r) => r.sfuUrl))).toEqual(
      new Set([sfuUrl, otherSfuUrl]),
    );
    for (const request of requests) expect(request.status).toBe(200);
  }
});

/** Skips the calling test if we're running on Firefox. */
function skipOnFirefox(browserName: string): void {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );
}

/** Points this page's Element Call at another homeserver. */
async function useHomeserver(
  page: Page,
  homeserver: typeof otherHomeserver,
): Promise<void> {
  await page.route("**/config.json", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: {
        ...config,
        default_server_config: { "m.homeserver": homeserver },
      },
    });
  });
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
  /** Who was asked to send the leave event on the guest's behalf. */
  via: "homeserver" | "service";
  status: number;
  sfuUrl?: string;
  delayId?: string;
}

/**
 * Records requests that delegate a delayed leave event, or probe for support:
 * the MSC4195 `delegate_delayed_leave` endpoint of the homeserver, and the JWT
 * service's `delegate_delayed_leave` probe and `/sfu/get` with delay fields.
 */
function recordDelegations(page: Page): Delegation[] {
  const delegations: Delegation[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    const url = request.url();
    const body = request.postDataJSON() as {
      url?: string;
      delay_id?: string;
    } | null;
    if (url.endsWith("/rtc/livekit/delegate_delayed_leave")) {
      delegations.push({
        via: "homeserver",
        status: response.status(),
        ...(body && { sfuUrl: body.url, delayId: body.delay_id }),
      });
    } else if (url.endsWith("/livekit/jwt/delegate_delayed_leave")) {
      delegations.push({ via: "service", status: response.status() });
    } else if (url.endsWith("/livekit/jwt/sfu/get") && body?.delay_id) {
      delegations.push({
        via: "service",
        status: response.status(),
        delayId: body.delay_id,
      });
    }
  });
  return delegations;
}

/** A recorded token request. */
interface AuthRequest {
  flow: Flow;
  status: number;
  /** The SFU a request to the MSC4195 `get_token` endpoint asked for. */
  sfuUrl?: string;
  /** The participant identity the issued token carries. */
  identity?: string;
}

/** The legacy `<user_id>:<device_id>` participant identity. */
const legacyIdentity = /^@[^:]+:[^:]+:[A-Z]+$/;
/** A hashed participant identity: unpadded base64 of a SHA-256. */
const hashedIdentity = /^[A-Za-z0-9+/]{43}$/;

/** Reads the subject of a JWT without verifying it. */
function jwtSubject(jwt: string): string {
  const [, payload] = jwt.split(".");
  return (
    JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub: string;
    }
  ).sub;
}

/** Records token requests, including the identity each token carries. */
function recordAuthRequests(page: Page): AuthRequest[] {
  const requests: AuthRequest[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    const url = request.url();
    let entry: AuthRequest;
    if (url.endsWith("/rtc/livekit/get_token")) {
      entry = {
        flow: "cs-api",
        status: response.status(),
        sfuUrl: (request.postDataJSON() as { url: string }).url,
      };
    } else if (url.endsWith("/livekit/jwt/sfu/get")) {
      entry = { flow: "service-legacy", status: response.status() };
    } else if (url.endsWith("/livekit/jwt/get_token")) {
      entry = { flow: "service-default", status: response.status() };
    } else {
      return;
    }
    requests.push(entry);
    if (entry.status !== 200) return;
    response
      .json()
      .then((body: { jwt: string }) => {
        entry.identity = jwtSubject(body.jwt);
      })
      .catch(() => {});
  });
  return requests;
}
