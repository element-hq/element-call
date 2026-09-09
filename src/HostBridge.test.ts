/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import {
  type ITransport,
  type WidgetApi,
  WidgetApiResponseError,
  WidgetApiToWidgetAction,
} from "matrix-widget-api";
import EventEmitter from "events";
import { KnownMembership, MatrixError } from "matrix-js-sdk";

import { type Observable } from "rxjs";

import {
  createWidgetHostBridge,
  type HostBridge,
  nullHostBridge,
} from "./HostBridge";
import { ElementWidgetActions, type WidgetHelpers } from "./widget";
import { MembershipUnsupportedError } from "./room/membership";

function mockWidget(api: Partial<WidgetApi>): WidgetHelpers {
  return {
    api: api as WidgetApi,
    lazyActions: new EventEmitter(),
    client: Promise.resolve(),
  } as unknown as WidgetHelpers;
}

/** A widget whose transport records what Element Call sends it. */
function mockTransport(): {
  send: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn(),
    stop: vi.fn(),
  };
}

describe("createWidgetHostBridge", () => {
  describe("telling the host what Element Call is doing", () => {
    test("asks to be kept on screen, and to stop being", async () => {
      const setAlwaysOnScreen = vi.fn().mockResolvedValue(true);
      const bridge = createWidgetHostBridge(mockWidget({ setAlwaysOnScreen }));

      await bridge.setAlwaysOnScreen(true);
      await bridge.setAlwaysOnScreen(false);

      expect(setAlwaysOnScreen).toHaveBeenNthCalledWith(1, true);
      expect(setAlwaysOnScreen).toHaveBeenNthCalledWith(2, false);
    });

    test("reports that it has loaded", async () => {
      const sendContentLoaded = vi.fn().mockResolvedValue(undefined);
      const bridge = createWidgetHostBridge(mockWidget({ sendContentLoaded }));

      await bridge.contentLoaded();

      expect(sendContentLoaded).toHaveBeenCalledOnce();
    });

    test.each([
      ["notifyJoined", ElementWidgetActions.JoinCall, {}],
      ["notifyHungUp", ElementWidgetActions.HangupCall, {}],
    ] as const)("sends %s as %s", async (method, action, payload) => {
      const transport = mockTransport();
      const bridge = createWidgetHostBridge(mockWidget({ transport } as never));

      await bridge[method]();

      expect(transport.send).toHaveBeenCalledWith(action, payload);
    });

    test("sends the mute state the host needs to mirror", async () => {
      const transport = mockTransport();
      const bridge = createWidgetHostBridge(mockWidget({ transport } as never));

      await bridge.notifyDeviceMute({
        audio_enabled: true,
        video_enabled: false,
      });

      expect(transport.send).toHaveBeenCalledWith(
        ElementWidgetActions.DeviceMute,
        { audio_enabled: true, video_enabled: false },
      );
    });
  });

  describe("relaying what the host asks for", () => {
    /** Emits a widget action the way widget.ts does, and returns the event. */
    function askHost(
      widget: WidgetHelpers,
      action: string,
      data: unknown,
    ): CustomEvent {
      const ev = new CustomEvent(action, { detail: { action, data } });
      widget.lazyActions.emit(action, ev);
      return ev;
    }

    // Selectors rather than keys, so each stream keeps its own request type
    const inboundStreams: [
      name: string,
      select: (bridge: HostBridge) => Observable<{ data: unknown }>,
      action: string,
    ][] = [
      [
        "themeChange$",
        (bridge) => bridge.themeChange$,
        WidgetApiToWidgetAction.ThemeChange,
      ],
      ["join$", (bridge) => bridge.join$, ElementWidgetActions.JoinCall],
      ["hangUp$", (bridge) => bridge.hangUp$, ElementWidgetActions.HangupCall],
      [
        "deviceMute$",
        (bridge) => bridge.deviceMute$,
        ElementWidgetActions.DeviceMute,
      ],
    ];

    test.each(inboundStreams)(
      "surfaces %s with the host's data",
      (_name, select, action) => {
        const widget = mockWidget({ transport: mockTransport() } as never);
        const bridge = createWidgetHostBridge(widget);
        const seen: unknown[] = [];
        select(bridge).subscribe((request) => seen.push(request.data));

        askHost(widget, action, { some: "payload" });

        expect(seen).toEqual([{ some: "payload" }]);
      },
    );

    test("replies to the host against the request it made", () => {
      const transport = mockTransport();
      const widget = mockWidget({ transport } as never);
      const bridge = createWidgetHostBridge(widget);
      bridge.deviceMute$.subscribe((request) =>
        request.reply({ audio_enabled: false, video_enabled: true }),
      );

      const ev = askHost(widget, ElementWidgetActions.DeviceMute, {
        audio_enabled: false,
      });

      expect(transport.reply).toHaveBeenCalledWith(ev.detail, {
        audio_enabled: false,
        video_enabled: true,
      });
    });

    test("still replies when there is nothing to say", () => {
      const transport = mockTransport();
      const widget = mockWidget({ transport } as never);
      const bridge = createWidgetHostBridge(widget);
      bridge.hangUp$.subscribe((request) => request.reply());

      const ev = askHost(widget, ElementWidgetActions.HangupCall, {});

      // The widget API requires an answer, so an empty reply becomes {}
      expect(transport.reply).toHaveBeenCalledWith(ev.detail, {});
    });

    test("stops listening once unsubscribed", () => {
      const widget = mockWidget({ transport: mockTransport() } as never);
      const bridge = createWidgetHostBridge(widget);
      const seen: unknown[] = [];
      const subscription = bridge.hangUp$.subscribe((r) => seen.push(r.data));

      subscription.unsubscribe();
      askHost(widget, ElementWidgetActions.HangupCall, {});

      expect(seen).toEqual([]);
    });
  });

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

  describe("changeMembership", () => {
    const bridgeReplying = (
      send: ReturnType<typeof vi.fn>,
    ): ReturnType<typeof createWidgetHostBridge> =>
      createWidgetHostBridge(
        mockWidget({ transport: { send } as unknown as ITransport }),
      );

    test("asks the host to knock, and reports what it ended up with", async () => {
      const send = vi
        .fn()
        .mockResolvedValue({ membership: KnownMembership.Knock });
      const bridge = bridgeReplying(send);

      await expect(
        bridge.changeMembership!({ action: "knock", reason: "let me in" }),
      ).resolves.toBe(KnownMembership.Knock);
      expect(send).toHaveBeenCalledWith("io.element.membership", {
        action: "knock",
        reason: "let me in",
      });
    });

    test("turns a refusal by the homeserver into a MatrixError", async () => {
      const bridge = bridgeReplying(
        vi.fn().mockRejectedValue(
          new WidgetApiResponseError("Failed to knock", {
            matrix_api_error: {
              http_status: 403,
              http_headers: {},
              url: "/_matrix/client/v3/knock/!call:example.org",
              response: {
                errcode: "M_FORBIDDEN",
                error: "You are not invited",
              },
            },
          }),
        ),
      );

      await expect(
        bridge.changeMembership!({ action: "knock" }),
      ).rejects.toSatisfy(
        (error) =>
          error instanceof MatrixError && error.errcode === "M_FORBIDDEN",
      );
    });

    test("reports a host that does not implement the action", async () => {
      const bridge = bridgeReplying(
        vi
          .fn()
          .mockRejectedValue(
            new WidgetApiResponseError(
              "Unknown or unsupported from-widget action: io.element.membership",
              {},
            ),
          ),
      );

      await expect(
        bridge.changeMembership!({ action: "knock" }),
      ).rejects.toBeInstanceOf(MembershipUnsupportedError);
    });

    test("passes a transport failure through", async () => {
      const timeout = new Error("Request timed out");
      const bridge = bridgeReplying(vi.fn().mockRejectedValue(timeout));

      await expect(bridge.changeMembership!({ action: "join" })).rejects.toBe(
        timeout,
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

  test("does not offer profile changes, since the host signed the user in", () => {
    const bridge = createWidgetHostBridge(mockWidget({}));
    expect(bridge.supportsProfileChanges).toBe(false);
  });

  test("allows joining unmuted on the intent, since the host asked for the call", () => {
    const bridge = createWidgetHostBridge(mockWidget({}));
    expect(bridge.allowJoinUnmutedViaIntent).toBe(true);
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

  test("supports profile changes, since Element Call signed the user in itself", () => {
    expect(nullHostBridge.supportsProfileChanges).toBe(true);
  });

  test("offers no media download, so Element Call uses its own client", () => {
    expect(nullHostBridge.downloadMedia).toBeUndefined();
  });

  test("changes no membership, so Element Call uses its own client", () => {
    expect(nullHostBridge.changeMembership).toBeUndefined();
  });

  test("supports reactions, since nothing is mediating its homeserver access", () => {
    expect(nullHostBridge.supportsReactions).toBe(true);
  });

  test("does not allow joining unmuted on the intent, since nobody vouched for it", () => {
    expect(nullHostBridge.allowJoinUnmutedViaIntent).toBe(false);
  });
});
