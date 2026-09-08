/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, it, vi } from "vitest";

import { init as initRageshake } from "./rageshake";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("flushes logs to IndexedDB periodically without an explicit flush", async () => {
  vi.useFakeTimers();
  const add = vi.fn();
  const txn = {
    oncomplete: undefined as (() => void) | undefined,
    onerror: undefined,
    objectStore: (name: string) =>
      name === "logs"
        ? {
            add: (entry: unknown): void => {
              add(entry);
              queueMicrotask(() => txn.oncomplete?.());
            },
          }
        : { put: vi.fn() },
  };
  const open = (): unknown => {
    const req = {
      result: { transaction: () => txn },
      onsuccess: undefined as (() => void) | undefined,
    };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  vi.stubGlobal("indexedDB", { open });

  await initRageshake();
  global.mx_rage_logger.log(1, "test", "hello from the buffer");
  expect(add).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(2000);
  expect(add).toHaveBeenCalledOnce();
  expect(add.mock.calls[0][0]).toMatchObject({
    lines: expect.stringContaining("hello from the buffer"),
  });
});
