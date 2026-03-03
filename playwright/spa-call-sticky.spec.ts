/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  type Locator,
  type Page,
  test,
  type Request,
  type Browser,
  type ConsoleMessage,
} from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

const RNNOISE_LABEL = "Enable enhanced noise suppression (RNNoise)";
const RNNOISE_TOGGLE_SELECTOR = "#activateRNNoiseSuppression";

async function setupTwoUserSpaCall(
  browser: Browser,
  page: Page,
  browserName: string,
  callName = `HelloCall-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
): Promise<{ guestPage: Page }> {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  await page.goto("/");

  let androlHasSentStickyEvent = false;

  await interceptEventSend(
    page,
    // This room is not encrypted, so the event is sent in clear
    "org.matrix.msc4143.rtc.member",
    (req) => {
      androlHasSentStickyEvent =
        androlHasSentStickyEvent || isStickySend(req.url());
    },
  );

  await SpaHelpers.createCall(page, "Androl", callName, true, "2_0");

  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  // Other
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();

  await guestPage.goto("/");

  let pevaraHasSentStickyEvent = false;

  await interceptEventSend(
    guestPage,
    // This room is not encrypted, so the event is sent in clear
    "org.matrix.msc4143.rtc.member",
    (req) => {
      pevaraHasSentStickyEvent =
        pevaraHasSentStickyEvent || isStickySend(req.url());
    },
  );

  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );
  // Assert both sides have sent sticky membership events
  await expect.poll(() => androlHasSentStickyEvent).toBe(true);
  await expect.poll(() => pevaraHasSentStickyEvent).toBe(true);

  return { guestPage };
}

test("One to One call using matrix rtc 2.0 aka sticky events", async ({
  browser,
  page,
  browserName,
}) => {
  const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);
});

// This issue occurs when a member leave but does not clean up their sticky event.
// If they rejoin they will use a new stickye key (stickyKey = member.id = UUID())
// We end up with two memberships with the same user and device id. This previously
// was a impossible case since that would be the same state event. Now its possible.
// We need to ALWAYS key by userId, deviceId and member.id. This test checks that.
test("One to One rejoin after improper leave does not crash EC", async ({
  browser,
  page,
  browserName,
}) => {
  const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

  await SpaHelpers.expectVideoTilesCount(page, 2);
  await SpaHelpers.expectVideoTilesCount(guestPage, 2);

  await guestPage.reload();
  await expect(guestPage.getByTestId("lobby_joinCall")).toBeVisible();

  // Check if rejoining with the same browser context (device) breaks EC.
  // This has happened on versions that do not consider the member.id as part of the key for a media tile.
  await guestPage.getByTestId("lobby_joinCall").click();

  // We cannot use the `expectVideoTilesCount` helper here since one of them is expected to show waiting for media
  await expect(page.getByTestId("videoTile")).toHaveCount(3);
  await expect(guestPage.getByTestId("videoTile")).toHaveCount(2);
});

test.describe("RNNoise scenarios", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "RNNoise scenarios are validated on Chromium fake-media infrastructure.",
  );

  test("One to One rejoin after improper leave stays stable with RNNoise enabled", async ({
    browser,
    page,
    browserName,
  }) => {
    const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);

    const rnnoiseSupported = await enableRNNoiseInSettings(guestPage);
    test.skip(
      !rnnoiseSupported,
      "RNNoise is not supported in this browser environment",
    );

    await expect
      .poll(async () =>
        guestPage.evaluate(() =>
          localStorage.getItem("matrix-setting-rnnoise-noise-suppression"),
        ),
      )
      .toBe("true");

    await guestPage.reload();
    await expect(guestPage.getByTestId("lobby_joinCall")).toBeVisible();
    await guestPage.getByTestId("lobby_joinCall").click();

    // Rejoin after abrupt disconnect should remain stable with RNNoise enabled.
    await expect(page.getByTestId("videoTile")).toHaveCount(3);
    await expect(guestPage.getByTestId("videoTile")).toHaveCount(2);
    await expect(
      guestPage.getByRole("button", { name: "Mute microphone" }),
    ).toBeVisible();

    await expectRNNoiseEnabledInSettings(guestPage);
  });

  test("One to One call stays stable when switching devices with RNNoise enabled", async ({
    browser,
    page,
    browserName,
  }) => {
    const { guestPage } = await setupTwoUserSpaCall(browser, page, browserName);

    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);

    const rnnoiseSupported = await enableRNNoiseInSettings(guestPage);
    test.skip(
      !rnnoiseSupported,
      "RNNoise is not supported in this browser environment",
    );

    const rnnoiseErrors: string[] = [];
    const consoleHandler = (message: ConsoleMessage): void => {
      if (
        message.type() === "error" &&
        /rnnoise|audio\s*worklet/i.test(message.text())
      ) {
        rnnoiseErrors.push(message.text());
      }
    };
    guestPage.on("console", consoleHandler);

    await openAudioSettings(guestPage);
    const microphoneDeviceRadios = await getDeviceSelectionRadios(
      guestPage,
      "Microphone",
    );

    // Some Chromium fake-device environments expose only one audio-input device,
    // so device switching cannot be forced there. Fall back to output switching.
    if (microphoneDeviceRadios.count < 2) {
      const speakerDeviceRadios = await getDeviceSelectionRadios(
        guestPage,
        "Speaker",
      );
      expect(speakerDeviceRadios.count).toBeGreaterThan(0);

      if (speakerDeviceRadios.count > 1) {
        const selectedSpeakerBefore = await guestPage.evaluate(() =>
          localStorage.getItem("matrix-setting-audio-output"),
        );
        const targetSpeakerIndex =
          speakerDeviceRadios.firstUncheckedIndex >= 0
            ? speakerDeviceRadios.firstUncheckedIndex
            : 0;
        await speakerDeviceRadios.radios.nth(targetSpeakerIndex).click();
        await expect
          .poll(async () =>
            guestPage.evaluate(() =>
              localStorage.getItem("matrix-setting-audio-output"),
            ),
          )
          .not.toBe(selectedSpeakerBefore);
      }
    } else {
      const selectedMicrophoneBefore = await guestPage.evaluate(() =>
        localStorage.getItem("matrix-setting-audio-input"),
      );
      const targetMicrophoneIndex =
        microphoneDeviceRadios.firstUncheckedIndex >= 0
          ? microphoneDeviceRadios.firstUncheckedIndex
          : 1;
      await microphoneDeviceRadios.radios.nth(targetMicrophoneIndex).click();
      await expect
        .poll(async () =>
          guestPage.evaluate(() =>
            localStorage.getItem("matrix-setting-audio-input"),
          ),
        )
        .not.toBe(selectedMicrophoneBefore);
    }

    await guestPage.getByTestId("modal_close").click();
    await SpaHelpers.expectVideoTilesCount(page, 2);
    await SpaHelpers.expectVideoTilesCount(guestPage, 2);
    await expect(
      guestPage.getByRole("button", { name: "Mute microphone" }),
    ).toBeVisible();
    await expectRNNoiseEnabledInSettings(guestPage);
    expect(rnnoiseErrors).toEqual([]);

    guestPage.off("console", consoleHandler);
  });
});

function isStickySend(url: string): boolean {
  return !!new URL(url).searchParams.get(
    "org.matrix.msc4354.sticky_duration_ms",
  );
}

async function interceptEventSend(
  page: Page,
  eventType: string,
  callback: (request: Request) => void,
): Promise<void> {
  await page.route(
    `**/_matrix/client/v3/rooms/**/send/${eventType}/**`,
    async (route, req) => {
      callback(req);
      return route.continue();
    },
  );
}

async function openAudioSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Audio" }).click();
}

async function getDeviceSelectionRadios(
  page: Page,
  sectionHeading: string,
): Promise<{
  radios: Locator;
  count: number;
  firstUncheckedIndex: number;
}> {
  const section = page
    .locator("div")
    .filter({
      has: page.getByRole("heading", { name: sectionHeading, exact: true }),
    })
    .first();
  const radios = section.getByRole("radio");
  const count = await radios.count();
  const firstUncheckedIndex = await radios.evaluateAll((nodes) =>
    nodes.findIndex((node) => {
      if (node instanceof HTMLInputElement) {
        return !node.checked;
      }
      return node.getAttribute("aria-checked") !== "true";
    }),
  );

  return { radios, count, firstUncheckedIndex };
}

async function enableRNNoiseInSettings(page: Page): Promise<boolean> {
  await openAudioSettings(page);

  const rnnoiseLabel = page.locator("label", { hasText: RNNOISE_LABEL });
  await expect(rnnoiseLabel).toBeVisible();
  const rnnoiseToggle = page.locator(RNNOISE_TOGGLE_SELECTOR);
  const supported = await rnnoiseToggle.isEnabled();
  if (supported && !(await rnnoiseToggle.isChecked())) {
    await rnnoiseLabel.click();
    await expect(rnnoiseToggle).toBeChecked();
  }

  await page.getByTestId("modal_close").click();
  return supported;
}

async function expectRNNoiseEnabledInSettings(page: Page): Promise<void> {
  await openAudioSettings(page);

  const rnnoiseLabel = page.locator("label", { hasText: RNNOISE_LABEL });
  await expect(rnnoiseLabel).toBeVisible();
  const rnnoiseToggle = page.locator(RNNOISE_TOGGLE_SELECTOR);
  await expect(rnnoiseToggle).toBeChecked();

  await page.getByTestId("modal_close").click();
}
