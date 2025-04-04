/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { KeyProviderEvent } from "livekit-client";

import { MatrixKeyProvider } from "./matrixKeyProvider";

function mockRTCSession(): MatrixRTCSession {
  return {
    on: vi.fn(),
    off: vi.fn(),
    reemitEncryptionKeys: vi.fn(),
  } as unknown as MatrixRTCSession;
}

describe("matrixKeyProvider", () => {
  test("initializes", () => {
    const keyProvider = new MatrixKeyProvider();
    expect(keyProvider).toBeTruthy();
  });

  test("listens for key requests and emits existing keys", () => {
    const keyProvider = new MatrixKeyProvider();

    const session = mockRTCSession();

    keyProvider.setRTCSession(session);

    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
    expect(session.off).not.toHaveBeenCalled();
  });

  test("stops listening when session changes", () => {
    const keyProvider = new MatrixKeyProvider();

    const session1 = mockRTCSession();
    const session2 = mockRTCSession();

    keyProvider.setRTCSession(session1);
    expect(session1.off).not.toHaveBeenCalled();

    keyProvider.setRTCSession(session2);
    expect(session1.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
  });

  test("emits existing keys", () => {
    const keyProvider = new MatrixKeyProvider();
    const setKeyListener = vi.fn();
    keyProvider.on(KeyProviderEvent.SetKey, setKeyListener);

    const session = mockRTCSession();

    keyProvider.setRTCSession(session);

    expect(session.reemitEncryptionKeys).toHaveBeenCalled();
  });
});
