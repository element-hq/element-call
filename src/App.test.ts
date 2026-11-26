/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";

const initSPA = vi.hoisted(() => vi.fn());
vi.mock("./utils/spa", () => ({ initSPA }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  initSPA.mockReset();
});

test("the app restores its own session", async () => {
  vi.stubEnv("VITE_PACKAGE", "full");
  const { loadStandaloneClient } = await import("./App");
  const loadSession = vi.fn();
  const clearSession = vi.fn();
  initSPA.mockResolvedValue(null);

  await expect(loadStandaloneClient!(loadSession, clearSession)).resolves.toBe(
    null,
  );
  expect(initSPA).toHaveBeenCalledWith(loadSession, clearSession);
});

test("the embedded package has no session of its own", async () => {
  vi.stubEnv("VITE_PACKAGE", "embedded");
  const { loadStandaloneClient } = await import("./App");

  expect(loadStandaloneClient).toBeUndefined();
});
