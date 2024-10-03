/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc";
import { KeyProviderEvent } from "livekit-client";

import { MatrixKeyProvider } from "./matrixKeyProvider";

describe("matrixKeyProvider", () => {
  test("initializes", () => {
    const keyProvider = new MatrixKeyProvider();
    expect(keyProvider).toBeTruthy();
  });

  test("listens for key requests and emits existing keys", () => {
    const keyProvider = new MatrixKeyProvider();

    const session: MatrixRTCSession = {
      on: vi.fn(),
      off: vi.fn(),
      getEncryptionKeys: vi.fn().mockReturnValue([]),
    } as unknown as MatrixRTCSession;

    keyProvider.setRTCSession(session);

    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
    expect(session.off).not.toHaveBeenCalled();
  });

  test("stops listening when session changes", () => {
    const keyProvider = new MatrixKeyProvider();

    const session1: MatrixRTCSession = {
      on: vi.fn(),
      off: vi.fn(),
      getEncryptionKeys: vi.fn().mockReturnValue([]),
    } as unknown as MatrixRTCSession;

    const session2: MatrixRTCSession = {
      on: vi.fn(),
      off: vi.fn(),
      getEncryptionKeys: vi.fn().mockReturnValue([]),
    } as unknown as MatrixRTCSession;

    keyProvider.setRTCSession(session1);
    expect(session1.off).not.toHaveBeenCalled();

    keyProvider.setRTCSession(session2);
    expect(session1.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
  });

  test("emits existing keys", async () => {
    vi.useFakeTimers();
    try {
      const keyProvider = new MatrixKeyProvider();
      const setKeyListener = vi.fn();
      keyProvider.on(KeyProviderEvent.SetKey, setKeyListener);

      const session: MatrixRTCSession = {
        on: vi.fn(),
        off: vi.fn(),
        room: {
          roomId: "mockRoomId",
        },
        getEncryptionKeys: vi
          .fn()
          .mockReturnValue(
            new Array([
              "mockParticipantId",
              [
                new TextEncoder().encode("key0"),
                new TextEncoder().encode("key1"),
              ],
            ]),
          ),
      } as unknown as MatrixRTCSession;

      keyProvider.setRTCSession(session);

      expect(session.getEncryptionKeys).toHaveBeenCalled();

      await vi.runAllTimersAsync();
      expect(setKeyListener).toHaveBeenCalledTimes(2);
      expect(setKeyListener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.any(CryptoKey),
          participantIdentity: "mockParticipantId",
          keyIndex: 0,
        }),
      );
      expect(setKeyListener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.any(CryptoKey),
          participantIdentity: "mockParticipantId",
          keyIndex: 1,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
