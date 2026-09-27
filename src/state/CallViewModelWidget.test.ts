/*
Copyright 2025 Element Creations Ltd.

  SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { it, vi, expect } from "vitest";
import { Subject } from "rxjs";

// import * as ComponentsCore from "@livekit/components-core";
import { withCallViewModel } from "./CallViewModel/CallViewModelTestUtils.ts";
import { type CallViewModel } from "./CallViewModel/CallViewModel.ts";
import { constant } from "./Behavior.ts";
import { aliceParticipant, localRtcMember } from "../utils/test-fixtures.ts";
import {
  type HostBridge,
  type HostRequest,
  nullHostBridge,
} from "../HostBridge.ts";
import { E2eeType } from "../e2ee/e2eeType.ts";
import { MatrixRTCMode } from "../config/ConfigOptions.ts";

vi.mock("@livekit/components-core", { spy: true });

it.each([[MatrixRTCMode.Compatibility], [MatrixRTCMode.Matrix_2_0]])(
  "expect leave when the host asks us to hang up (%s mode)",
  async (mode) => {
    const pr = Promise.withResolvers<string>();
    const hangUp$ = new Subject<HostRequest<Record<string, never>>>();
    const hostBridge: HostBridge = { ...nullHostBridge, hangUp$ };
    const reply = vi.fn();

    withCallViewModel(mode)(
      {
        remoteParticipants$: constant([aliceParticipant]),
        rtcMembers$: constant([localRtcMember]),
      },
      (vm: CallViewModel) => {
        vm.leave$.subscribe((s: string) => {
          pr.resolve(s);
        });

        hangUp$.next({ data: {}, reply });
      },
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        hostBridge,
      },
    );

    const source = await pr.promise;
    expect(source).toBe("user");
    // The host expects to hear back that we acted on its request
    expect(reply).toHaveBeenCalledOnce();
  },
);
