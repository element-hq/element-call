/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { KeyProviderEvent } from "livekit-client";

import { testScope } from "../utils/test";
import {
  FakeParticipation,
  fakeMediaKey,
  fakeMembership,
} from "../utils/test-participation";
import { waitFor } from "../driver/MockRtcMatrixDriver";
import { ParticipationKeyProvider } from "./participationKeyProvider";

interface SetKey {
  participantIdentity: string | undefined;
  keyIndex: number | undefined;
}

function attached(): {
  rtcParticipationManager: FakeParticipation;
  setKeys: SetKey[];
} {
  const rtcParticipationManager = new FakeParticipation();
  const provider = new ParticipationKeyProvider();
  const setKeys: SetKey[] = [];
  provider.on(KeyProviderEvent.SetKey, ({ participantIdentity, keyIndex }) =>
    setKeys.push({ participantIdentity, keyIndex }),
  );
  provider.attach(testScope(), rtcParticipationManager);
  return { rtcParticipationManager, setKeys };
}

describe("ParticipationKeyProvider", () => {
  it("hands our own key to LiveKit under our transport identity", async () => {
    const { rtcParticipationManager, setKeys } = attached();
    rtcParticipationManager.ownMemberId$.next("m-me");
    rtcParticipationManager.ownTransportIdentity$.next("lk-me");
    rtcParticipationManager.keyMap$.next([
      fakeMediaKey({ memberId: "m-me", index: 0 }),
    ]);
    await waitFor("own key set", () => setKeys.length === 1);
    expect(setKeys).toEqual([{ participantIdentity: "lk-me", keyIndex: 0 }]);
  });

  it("waits for a peer's transport identity and sets each key once", async () => {
    const { rtcParticipationManager, setKeys } = attached();
    // The key arrives before the roster knows the member's identity.
    rtcParticipationManager.keyMap$.next([
      fakeMediaKey({ memberId: "m-peer", index: 2 }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(setKeys).toEqual([]);

    rtcParticipationManager.setMemberships([
      fakeMembership({
        member: { memberId: "m-peer" },
        transportIdentity: "lk-peer",
      }),
    ]);
    await waitFor("peer key set", () => setKeys.length === 1);
    expect(setKeys).toEqual([{ participantIdentity: "lk-peer", keyIndex: 2 }]);

    // The map is re-emitted (a rotation elsewhere): no second delivery.
    rtcParticipationManager.keyMap$.next([
      fakeMediaKey({ memberId: "m-peer", index: 2 }),
      fakeMediaKey({ memberId: "m-peer", index: 3 }),
    ]);
    await waitFor("next index set", () => setKeys.length === 2);
    expect(setKeys[1]).toEqual({ participantIdentity: "lk-peer", keyIndex: 3 });
  });
});
