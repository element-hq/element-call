/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { KeyProviderEvent } from "livekit-client";
import { Subject } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { type MediaKey } from "../api";
import { MatrixKeyProvider } from "./MatrixKeyProvider";

describe("matrixKeyProvider", () => {
  test("initializes", () => {
    const keyProvider = new MatrixKeyProvider();
    expect(keyProvider).toBeTruthy();
  });

  test("follows the key stream it is given", async () => {
    // jsdom has no HKDF; the derived material is not what is under test
    vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const keyProvider = new MatrixKeyProvider();
    const setKey = vi.fn();
    keyProvider.on(KeyProviderEvent.SetKey, setKey);
    const keys$ = new Subject<MediaKey>();

    keyProvider.setMediaKeys(keys$);
    keys$.next({ participantId: "alice", index: 2, key: new Uint8Array(16) });
    await vi.waitFor(() =>
      expect(setKey.mock.lastCall?.[0]).toMatchObject({
        participantIdentity: "alice",
        keyIndex: 2,
      }),
    );
  });

  test("stops following a stream when given another", () => {
    const keyProvider = new MatrixKeyProvider();
    const first$ = new Subject<MediaKey>();
    const second$ = new Subject<MediaKey>();

    keyProvider.setMediaKeys(first$);
    expect(first$.observed).toBe(true);

    keyProvider.setMediaKeys(second$);
    expect(first$.observed).toBe(false);
    expect(second$.observed).toBe(true);
  });
});
