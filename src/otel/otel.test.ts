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

import { ElementCallOpenTelemetry } from "./otel";
import { mockConfig } from "../utils/test";

describe("ElementCallOpenTelemetry", () => {
  describe("embedded package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "embedded");
    });

    beforeEach(() => {
      mockConfig({});
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value", () => {
      ElementCallOpenTelemetry.globalInit();
      expect(ElementCallOpenTelemetry.instance?.isOtlpEnabled).toBe(false);
    });

    it("ignores config value and does not create instance", () => {
      mockConfig({
        opentelemetry: {
          collector_url: "https://collector.example.com.localhost",
        },
      });
      ElementCallOpenTelemetry.globalInit();
      expect(ElementCallOpenTelemetry.instance?.isOtlpEnabled).toBe(false);
    });
  });

  describe("full package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });

    beforeEach(() => {
      mockConfig({});
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value", () => {
      ElementCallOpenTelemetry.globalInit();
      expect(ElementCallOpenTelemetry.instance?.isOtlpEnabled).toBe(false);
    });

    it("creates instance with config value", () => {
      mockConfig({
        opentelemetry: {
          collector_url: "https://collector.example.com.localhost",
        },
      });
      ElementCallOpenTelemetry.globalInit();
      expect(ElementCallOpenTelemetry.instance?.isOtlpEnabled).toBe(true);
    });
  });
});
