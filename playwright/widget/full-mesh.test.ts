/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user";
import { HOST1, TestHelpers } from "./test-helpers";

/**
 * Records the LiveKit signalling websockets a page opens: the SFU is reached
 * with an access token in the url, which full mesh never needs.
 */
function recordSfuSockets(page: Page): string[] {
  const urls: string[] = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("access_token")) urls.push(ws.url());
  });
  return urls;
}

/**
 * Starts recording the types of the to-device messages the widget on a page
 * asks its host to send, and returns a function reading them. On the wire
 * they are encrypted, so the type is only visible in the widget API.
 */
async function recordWidgetToDevice(
  page: Page,
): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const types: string[] = [];
    Object.assign(window, { widgetToDeviceTypes: types });
    window.addEventListener("message", ({ data }) => {
      const {
        action,
        response,
        data: request,
      } = (data ?? {}) as {
        action?: string;
        response?: unknown;
        data?: { type?: string };
      };
      if (action === "send_to_device" && response === undefined)
        types.push(request?.type ?? "");
    });
  });
  return async () =>
    page.evaluate(
      () =>
        (window as unknown as { widgetToDeviceTypes: string[] })
          .widgetToDeviceTypes,
    );
}

const cases: { name: string; fullMesh: [boolean, boolean] }[] = [
  // Both publish on full mesh: the media flows without any SFU
  { name: "both on full mesh", fullMesh: [true, true] },
  // One on each: Florian receives Valere over LiveKit without publishing there
  { name: "full mesh and LiveKit mixed", fullMesh: [true, false] },
];

cases.forEach(({ name, fullMesh: [florianMesh, valereMesh] }) => {
  widgetTest(`Full mesh call: ${name}`, async ({ addUser, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );
    test.slow();

    // Distinct per case: the cases run in parallel and register at once
    const suffix = `${Number(florianMesh)}${Number(valereMesh)}`;
    const [florian, valere] = await Promise.all([
      addUser(`florian${suffix}`, HOST1),
      addUser(`valere${suffix}`, HOST1),
    ]);
    // Element Web doesn't auto-approve the full mesh signalling for Element
    // Call yet, so it asks for it whenever a widget with full mesh opens
    for (const { page } of [florian, valere])
      await page.addLocatorHandler(
        page.getByRole("heading", { name: "Approve widget permissions" }),
        async () => page.getByRole("button", { name: "Approve" }).click(),
      );
    const sockets = {
      florian: recordSfuSockets(florian.page),
      valere: recordSfuSockets(valere.page),
    };

    const roomName = "Full Mesh Room";
    await TestHelpers.createRoom(roomName, florian.page, [valere.mxId]);
    await TestHelpers.acceptRoomInvite(roomName, valere.page);

    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      florian.page,
      "2_0",
      { fullMesh: florianMesh },
    );
    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      valere.page,
      "2_0",
      { fullMesh: valereMesh },
    );

    await TestHelpers.startCallInCurrentRoom(florian.page, false);
    await TestHelpers.joinCallFromLobby(florian.page);
    await TestHelpers.joinCallInCurrentRoom(valere.page);

    // A widget only asks for the full mesh signalling with full mesh turned
    // on, so a LiveKit publisher in Element Web can't receive full mesh yet:
    // the other's media arrives if it is on LiveKit or we have full mesh
    const receives = {
      florian: !valereMesh || florianMesh,
      valere: !florianMesh || valereMesh,
    };
    // In parallel: assertions on a page also run its permission handler
    await Promise.all(
      (["florian", "valere"] as const).map(async (name) => {
        const frame = { florian, valere }[name].page
          .locator('iframe[title="Element Call"]')
          .contentFrame();
        await expect(frame.getByTestId("videoTile")).toHaveCount(2, {
          timeout: 15000,
        });
        const waiting = frame.getByText("Waiting for media...");
        if (receives[name]) {
          // Over whichever transport carries it
          await expect(waiting).not.toBeVisible({ timeout: 20000 });
          await TestHelpers.expectVisibleVideoCount(frame, 2);
        } else {
          await expect(waiting).toBeVisible({ timeout: 20000 });
          await TestHelpers.expectVisibleVideoCount(frame, 1);
        }
      }),
    );

    if (florianMesh && valereMesh) {
      // Nobody published on LiveKit, so nobody connected to an SFU
      expect(sockets.florian).toEqual([]);
      expect(sockets.valere).toEqual([]);
    } else {
      // Florian receives Valere's media from the SFU without publishing there
      expect(sockets.florian.length).toBeGreaterThan(0);
    }

    // Florian sees Valere's camera go off: over the stream metadata for full
    // mesh, without renegotiating
    const toDevice = await recordWidgetToDevice(valere.page);
    const valereFrame = valere.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await valereFrame.getByRole("switch", { name: "Stop video" }).click();
    const florianFrame = florian.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await TestHelpers.expectVisibleVideoCount(florianFrame, 1);
    // On the connection's control channel, not through the homeserver.
    // Candidates may still trickle there until the channel is up
    if (florianMesh && valereMesh)
      expect(
        (await toDevice()).filter(
          (type) => type.includes("full_mesh") && !type.endsWith(".candidates"),
        ),
      ).toEqual([]);
  });
});
