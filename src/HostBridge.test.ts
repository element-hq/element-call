/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { type WidgetApi } from "matrix-widget-api";
import EventEmitter from "events";

import { createWidgetHostBridge, nullHostBridge } from "./HostBridge";
import { ElementWidgetActions, type WidgetHelpers } from "./widget";

function mockWidget(api: Partial<WidgetApi>): WidgetHelpers {
  return {
    api: api as WidgetApi,
    lazyActions: new EventEmitter(),
    client: Promise.resolve(),
  } as unknown as WidgetHelpers;
}

describe("createWidgetHostBridge", () => {
  describe("downloadMedia", () => {
    const mxcUri = "mxc://example.org/alice-avatar";

    test("passes a Blob through unchanged", async () => {
      const file = new Blob([]);
      const bridge = createWidgetHostBridge(
        mockWidget({ downloadFile: vi.fn().mockResolvedValue({ file }) }),
      );

      await expect(bridge.downloadMedia!(mxcUri)).resolves.toBe(file);
    });

    test("decodes a base64 string into a Blob", async () => {
      const bridge = createWidgetHostBridge(
        mockWidget({
          // "hello" in base64
          downloadFile: vi.fn().mockResolvedValue({ file: "aGVsbG8=" }),
        }),
      );

      const blob = await bridge.downloadMedia!(mxcUri);

      expect(blob).toBeInstanceOf(Blob);
      // The five decoded bytes, rather than the eight characters of base64 —
      // which is what we'd get if the string were stored verbatim.
      expect(blob.size).toBe(5);
    });

    test("rejects a file format it does not understand", async () => {
      const bridge = createWidgetHostBridge(
        mockWidget({ downloadFile: vi.fn().mockResolvedValue({ file: 42 }) }),
      );

      await expect(bridge.downloadMedia!(mxcUri)).rejects.toThrow(
        "Downloaded file format is not supported",
      );
    });
  });

  describe("close", () => {
    test("asks the host to close, then stops the transport", async () => {
      const transport = {
        send: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      };
      const bridge = createWidgetHostBridge(mockWidget({ transport } as never));

      await bridge.close!();

      expect(transport.send).toHaveBeenCalledWith(
        ElementWidgetActions.Close,
        {},
      );
      expect(transport.stop).toHaveBeenCalledOnce();
    });

    test("stops the transport even when the host refuses to close", async () => {
      const transport = {
        send: vi.fn().mockRejectedValue(new Error("no")),
        stop: vi.fn(),
      };
      const bridge = createWidgetHostBridge(mockWidget({ transport } as never));

      // Leaving the messaging live would leave the close affordance dead
      await expect(bridge.close!()).rejects.toThrow("no");
      expect(transport.stop).toHaveBeenCalledOnce();
    });
  });

  describe("supportsReactions", () => {
    const capabilities = [
      "org.matrix.msc2762.send.event:m.reaction",
      "org.matrix.msc2762.send.event:m.room.redaction",
      "org.matrix.msc2762.receive.event:m.reaction",
      "org.matrix.msc2762.receive.event:m.room.redaction",
    ];

    test("is true when the host grants every reaction capability", () => {
      const bridge = createWidgetHostBridge(
        mockWidget({ hasCapability: () => true }),
      );

      expect(bridge.supportsReactions).toBe(true);
    });

    test.each(capabilities)("is false without %s", (missing) => {
      const bridge = createWidgetHostBridge(
        mockWidget({ hasCapability: (c) => c !== missing }),
      );

      expect(bridge.supportsReactions).toBe(false);
    });
  });
});

describe("nullHostBridge", () => {
  test("offers no way to close, so the interface falls back to navigation", () => {
    expect(nullHostBridge.close).toBeUndefined();
  });

  test("offers no media download, so Element Call uses its own client", () => {
    expect(nullHostBridge.downloadMedia).toBeUndefined();
  });

  test("supports reactions, since nothing is mediating its homeserver access", () => {
    expect(nullHostBridge.supportsReactions).toBe(true);
  });
});
