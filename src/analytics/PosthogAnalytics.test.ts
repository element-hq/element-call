/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  describe,
  it,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import posthog, { type CaptureResult } from "posthog-js";

import {
  Anonymity,
  santizeSensitiveData,
  PosthogAnalytics,
} from "./PosthogAnalytics";
import { mockConfig } from "../utils/test";
import { analyticsConfigFromEnvironment } from "../initializer";

describe("PosthogAnalytics", () => {
  describe("enablement", () => {
    beforeEach(() => {
      PosthogAnalytics.resetInstance();
    });

    it("stays off until it is configured", () => {
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("stays off when configured without credentials", () => {
      PosthogAnalytics.configure({ matrixBackend: "jssdk" });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("stays off when given only a key", () => {
      PosthogAnalytics.configure({
        matrixBackend: "jssdk",
        apiKey: "api_key",
      });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("turns on when given both a key and a host", () => {
      PosthogAnalytics.configure({
        matrixBackend: "jssdk",
        apiKey: "api_key",
        apiHost: "https://api.example.com.localhost",
      });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);
    });
  });

  // Which of the URL and config.json the credentials come from is a deliberate
  // policy: an embedder is responsible for its own users' telemetry, so it must
  // not pick up the deployment's, and vice versa.
  describe("analyticsConfigFromEnvironment", () => {
    beforeEach(() => {
      mockConfig({});
      window.location.hash = "#";
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    const urlCredentials = `posthogApiHost=${encodeURIComponent("https://url.example.com.localhost")}&posthogApiKey=url_key`;
    const configCredentials = {
      posthog: {
        api_host: "https://config.example.com.localhost",
        api_key: "config_key",
      },
    };

    describe("embedded package", () => {
      beforeAll(() => {
        vi.stubEnv("VITE_PACKAGE", "embedded");
      });

      it("has no credentials without URL params", () => {
        expect(analyticsConfigFromEnvironment().apiKey).toBeUndefined();
      });

      it("takes the credentials from the URL", () => {
        window.location.hash = `#?${urlCredentials}`;
        expect(analyticsConfigFromEnvironment()).toMatchObject({
          apiKey: "url_key",
          apiHost: "https://url.example.com.localhost",
        });
      });

      it("ignores the deployment's config", () => {
        mockConfig(configCredentials);
        expect(analyticsConfigFromEnvironment().apiKey).toBeUndefined();
      });
    });

    describe("full package", () => {
      beforeAll(() => {
        vi.stubEnv("VITE_PACKAGE", "full");
      });

      it("has no credentials without config", () => {
        expect(analyticsConfigFromEnvironment().apiKey).toBeUndefined();
      });

      it("takes the credentials from the config", () => {
        mockConfig(configCredentials);
        expect(analyticsConfigFromEnvironment()).toMatchObject({
          apiKey: "config_key",
          apiHost: "https://config.example.com.localhost",
        });
      });

      it("ignores the URL params", () => {
        window.location.hash = `#?${urlCredentials}`;
        expect(analyticsConfigFromEnvironment().apiKey).toBeUndefined();
      });
    });

    // Who owns the user's analytics identity depends on how Element Call is
    // running, not on which package it was built as.
    it("reports the embedded backend when running as a widget", () => {
      vi.stubEnv("VITE_PACKAGE", "full");
      window.location.hash = `#?widgetId=id&parentUrl=${encodeURIComponent("https://host.example.com.localhost")}&posthogUserId=given_id`;
      expect(analyticsConfigFromEnvironment()).toMatchObject({
        matrixBackend: "embedded",
        hostAnalyticsId: "given_id",
      });
    });

    it("reports the jssdk backend when running standalone", () => {
      expect(analyticsConfigFromEnvironment().matrixBackend).toBe("jssdk");
    });
  });

  describe("applyPrivacyFilters", () => {
    const makeEvent = (properties: Record<string, unknown>): CaptureResult =>
      ({ event: "anyEvent", properties }) as unknown as CaptureResult;

    it("drops $initial_person_info regardless of anonymity", () => {
      const out = santizeSensitiveData(
        makeEvent({
          $current_url: "https://call.example.com/some/private/path",
          $initial_person_info: {
            r: "https://example.com/referrer",
            u: "https://call.example.com/some/private/path",
          },
        }),
        Anonymity.Pseudonymous,
      );
      expect(out?.properties).not.toHaveProperty("$initial_person_info");
    });

    it("strips hash from $current_url", () => {
      const out = santizeSensitiveData(
        makeEvent({ $current_url: "https://call.example.com/#/x/y/z" }),
        Anonymity.Pseudonymous,
      );
      expect(out?.properties["$current_url"]).not.toContain("/x/y/z");
    });

    it("nulls referrer and device fields when anonymous", () => {
      const out = santizeSensitiveData(
        makeEvent({
          $current_url: "https://x/y",
          $referrer: "https://leaky",
          $initial_referrer: "https://leaky-too",
          $device_id: "uuid",
        }),
        Anonymity.Anonymous,
      );
      expect(out?.properties["$referrer"]).toBeUndefined();
      expect(out?.properties["$initial_referrer"]).toBeUndefined();
      expect(out?.properties["$device_id"]).toBeUndefined();
    });

    it("passes null events through unchanged", () => {
      expect(santizeSensitiveData(null, Anonymity.Pseudonymous)).toBeNull();
    });

    it("strips URL fields nested inside $set_once", () => {
      const secretUrl =
        "https://call.example.com/room/#/?password=hunter2&roomId=abc";
      const out = santizeSensitiveData(
        makeEvent({
          $current_url: "https://call.example.com/x",
          $set_once: {
            $current_url: secretUrl,
            $initial_current_url: secretUrl,
            $session_entry_url: secretUrl,
            $initial_person_info: { r: "x", u: secretUrl },
          },
        }),
        Anonymity.Pseudonymous,
      );

      const setOnce = out?.properties["$set_once"] as Record<string, unknown>;
      expect(setOnce["$current_url"]).not.toContain("password");
      expect(setOnce["$initial_current_url"]).not.toContain("password");
      expect(setOnce).not.toHaveProperty("$session_entry_url");
      expect(setOnce).not.toHaveProperty("$initial_person_info");
    });

    it("strips URL fields nested inside $set", () => {
      const secretUrl =
        "https://call.example.com/room/#/?password=hunter2&roomId=abc";
      const out = santizeSensitiveData(
        makeEvent({
          $current_url: "https://call.example.com/x",
          $set: {
            $current_url: secretUrl,
            $session_entry_url: secretUrl,
          },
        }),
        Anonymity.Pseudonymous,
      );

      const set = out?.properties["$set"] as Record<string, unknown>;
      expect(set["$current_url"]).not.toContain("password");
      expect(set).not.toHaveProperty("$session_entry_url");
    });

    it("nulls referrer fields inside $set_once when anonymous", () => {
      const out = santizeSensitiveData(
        makeEvent({
          $current_url: "https://x/y",
          $set_once: {
            $initial_referrer: "https://leaky",
            $initial_referring_domain: "leaky",
          },
        }),
        Anonymity.Anonymous,
      );

      const setOnce = out?.properties["$set_once"] as Record<string, unknown>;
      expect(setOnce["$initial_referrer"]).toBeUndefined();
      expect(setOnce["$initial_referring_domain"]).toBeUndefined();
    });
  });

  // Verifies that applyPrivacyFilters is actually wired into posthog.init via
  // the before_send hook — guards against typos in the option name or future
  // posthog-js bumps renaming/removing the hook. The filter logic itself is
  // covered by the applyPrivacyFilters block above.
  describe("posthog.init wiring", () => {
    beforeEach(() => {
      PosthogAnalytics.resetInstance();
      PosthogAnalytics.configure({
        matrixBackend: "jssdk",
        apiKey: "api_key",
        apiHost: "https://api.example.com.localhost",
      });
    });

    it("passes events through the privacy filter via before_send", () => {
      const initSpy = vi.spyOn(posthog, "init");
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);

      const beforeSend = initSpy.mock.calls[0][1]?.before_send;
      expect(beforeSend).toBeInstanceOf(Function);

      const event = {
        event: "anyEvent",
        properties: {
          $current_url: "https://call.example.com/x/y",
          $initial_person_info: { r: "x" },
        },
      } as unknown as CaptureResult;

      const out = (beforeSend as (e: CaptureResult) => CaptureResult | null)(
        event,
      );
      expect(out?.properties).not.toHaveProperty("$initial_person_info");
    });
  });
});
