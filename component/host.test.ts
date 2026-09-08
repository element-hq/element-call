/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  type ElementCallHandle,
  type ElementCallHostBridge,
  useComponentHostBridge,
} from "./host";

describe("useComponentHostBridge", () => {
  test("keeps one identity while the host supplies new objects", () => {
    const { result, rerender } = renderHook(
      ({ supplied }: { supplied: ElementCallHostBridge }) =>
        useComponentHostBridge(supplied, undefined, undefined),
      { initialProps: { supplied: {} } },
    );
    const first = result.current;
    rerender({ supplied: { notifyJoined: async () => {} } });
    expect(result.current).toBe(first);
  });

  test("forwards to whatever the host most recently supplied", async () => {
    const before = vi.fn().mockResolvedValue(undefined);
    const after = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ supplied }: { supplied: ElementCallHostBridge }) =>
        useComponentHostBridge(supplied, undefined, undefined),
      { initialProps: { supplied: { notifyJoined: before } } },
    );
    rerender({ supplied: { notifyJoined: after } });

    await result.current.notifyJoined();
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledOnce();
  });

  test("is quiet about what the host did not implement", async () => {
    const { result } = renderHook(() =>
      useComponentHostBridge(undefined, undefined, undefined),
    );
    await expect(result.current.contentLoaded()).resolves.toBeUndefined();
    await expect(
      result.current.notifyDeviceMute({
        audio_enabled: true,
        video_enabled: false,
      }),
    ).resolves.toBeUndefined();
    expect(result.current.supportsReactions).toBe(true);
    // Starting the user unmuted unasked is something a host has to opt into
    expect(result.current.allowJoinUnmutedViaIntent).toBe(false);
  });

  test("lets the host allow joining unmuted on the intent", () => {
    const { result, rerender } = renderHook(
      ({ supplied }: { supplied: ElementCallHostBridge }) =>
        useComponentHostBridge(supplied, undefined, undefined),
      { initialProps: { supplied: {} } },
    );
    expect(result.current.allowJoinUnmutedViaIntent).toBe(false);

    // Read through to whatever the host most recently said
    rerender({ supplied: { allowJoinUnmutedViaIntent: true } });
    expect(result.current.allowJoinUnmutedViaIntent).toBe(true);
  });

  test("only has a close when the host has one, since that is a signal", () => {
    const { result, rerender } = renderHook(
      ({ supplied }: { supplied: ElementCallHostBridge }) =>
        useComponentHostBridge(supplied, undefined, undefined),
      { initialProps: { supplied: {} } },
    );
    expect(result.current.close).toBeUndefined();

    const close = vi.fn().mockResolvedValue(undefined);
    rerender({ supplied: { close } });
    expect(result.current.close).toBeDefined();
  });

  test("never offers profile changes, since the account is the host's", () => {
    const { result } = renderHook(() =>
      useComponentHostBridge(undefined, undefined, undefined),
    );
    expect(result.current.supportsProfileChanges).toBe(false);
  });

  describe("the handle", () => {
    test("delivers a request to what is listening and resolves on its reply", async () => {
      const ref = createRef<ElementCallHandle>();
      const { result } = renderHook(() =>
        useComponentHostBridge(undefined, ref, undefined),
      );

      const received = vi.fn();
      result.current.deviceMute$.subscribe(({ data, reply }) => {
        received(data);
        reply({ audio_enabled: data.audio_enabled!, video_enabled: true });
      });

      await expect(
        ref.current!.setDeviceMute({ audio_enabled: false }),
      ).resolves.toEqual({ audio_enabled: false, video_enabled: true });
      expect(received).toHaveBeenCalledWith({ audio_enabled: false });
    });

    test("refuses a request nothing in Element Call is listening for", async () => {
      const ref = createRef<ElementCallHandle>();
      renderHook(() => useComponentHostBridge(undefined, ref, undefined));

      await expect(ref.current!.hangUp()).rejects.toThrow(
        "Nothing in Element Call can hang up right now",
      );
    });
  });

  describe("the theme", () => {
    test("reaches a subscriber that arrives after it was set", () => {
      const { result } = renderHook(() =>
        useComponentHostBridge(undefined, undefined, "light"),
      );
      const names: (string | undefined)[] = [];
      result.current.themeChange$.subscribe(({ data }) =>
        names.push(data.name),
      );
      expect(names).toEqual(["light"]);
    });

    test("follows the prop", () => {
      const { result, rerender } = renderHook(
        ({ theme }: { theme: string | undefined }) =>
          useComponentHostBridge(undefined, undefined, theme),
        { initialProps: { theme: "light" } },
      );
      const names: (string | undefined)[] = [];
      result.current.themeChange$.subscribe(({ data }) =>
        names.push(data.name),
      );

      rerender({ theme: "dark" });
      expect(names).toEqual(["light", "dark"]);
    });

    test("says nothing when the host leaves the theme to Element Call", () => {
      const { result } = renderHook(() =>
        useComponentHostBridge(undefined, undefined, undefined),
      );
      const names: (string | undefined)[] = [];
      result.current.themeChange$.subscribe(({ data }) =>
        names.push(data.name),
      );
      expect(names).toEqual([]);
    });
  });
});
