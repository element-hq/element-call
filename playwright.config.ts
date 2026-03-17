/*
Copyright 2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.USE_DOCKER
  ? "http://localhost:8080"
  : "https://localhost:3000";
const fakeAudioCaptureFile = process.env.PLAYWRIGHT_FAKE_AUDIO_CAPTURE_FILE;
const fakeVideoCaptureFile = process.env.PLAYWRIGHT_FAKE_VIDEO_CAPTURE_FILE;
const disableChromiumSandbox =
  process.env.PLAYWRIGHT_DISABLE_CHROMIUM_SANDBOX === "1";

function buildFakeMediaArgs(): string[] {
  const args = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--mute-audio",
  ];

  if (fakeAudioCaptureFile) {
    args.push(`--use-file-for-fake-audio-capture=${fakeAudioCaptureFile}`);
  }
  if (fakeVideoCaptureFile) {
    args.push(`--use-file-for-fake-video-capture=${fakeVideoCaptureFile}`);
  }

  return args;
}

const fakeMediaArgs = buildFakeMediaArgs();
const chromiumLaunchArgs = disableChromiumSandbox
  ? [...fakeMediaArgs, "--no-sandbox", "--disable-setuid-sandbox"]
  : fakeMediaArgs;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./playwright",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      testIgnore: "**/mobile/**",
      use: {
        ...devices["Desktop Chrome"],
        permissions: [
          "clipboard-write",
          "clipboard-read",
          "microphone",
          "camera",
        ],
        ignoreHTTPSErrors: true,
        chromiumSandbox: !disableChromiumSandbox,
        launchOptions: {
          args: chromiumLaunchArgs,
        },
      },
    },
    {
      name: "firefox",
      testIgnore: "**/mobile/**",
      use: {
        ...devices["Desktop Firefox"],
        ignoreHTTPSErrors: true,
        launchOptions: {
          firefoxUserPrefs: {
            "permissions.default.microphone": 1,
            "permissions.default.camera": 1,
          },
        },
      },
    },
    {
      name: "mobile",
      testMatch: "**/mobile/**",
      use: {
        ...devices["Pixel 7"],
        ignoreHTTPSErrors: true,
        permissions: [
          "clipboard-write",
          "clipboard-read",
          "microphone",
          "camera",
        ],
        chromiumSandbox: !disableChromiumSandbox,
        launchOptions: {
          args: chromiumLaunchArgs,
        },
      },
    },

    // No safari for now, until I find a solution to fix `Not allowed to request resource` due to calling
    // clear http to the homeserver
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "./scripts/playwright-webserver-command.sh",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 500,
    },
  },
});
