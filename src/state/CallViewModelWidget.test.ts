/*
Copyright 2025 Element Creations Ltd.

  SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { it, vi, expect } from "vitest";
import EventEmitter from "events";

// import * as ComponentsCore from "@livekit/components-core";
import { withCallViewModel } from "./CallViewModel/CallViewModelTestUtils.ts";
import { type CallViewModel } from "./CallViewModel/CallViewModel.ts";
import { constant } from "./Behavior.ts";
import { aliceParticipant, localRtcMember } from "../utils/test-fixtures.ts";
import { ElementWidgetActions, widget } from "../widget.ts";
import { E2eeType } from "../e2ee/e2eeType.ts";
import { MatrixRTCMode } from "../settings/settings.ts";

vi.mock("@livekit/components-core", { spy: true });

vi.mock("../widget", () => ({
  ElementWidgetActions: {
    HangupCall: "HangupCall",
    // Add other actions if needed
  },
  widget: {
    api: {
      transport: {
        send: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      },
    },
    lazyActions: new EventEmitter(),
  },
}));

it.each([
  [MatrixRTCMode.Legacy],
  [MatrixRTCMode.Compatibil],
  [MatrixRTCMode.Matrix_2_0],
])(
  "expect leave when ElementWidgetActions.HangupCall is called (%s mode)",
  async (mode) => {
    const pr = Promise.withResolvers<string>();
    withCallViewModel(mode)(
      {
        remoteParticipants$: constant([aliceParticipant]),
        rtcMembers$: constant([localRtcMember]),
      },
      (vm: CallViewModel) => {
        vm.leave$.subscribe((s: string) => {
          pr.resolve(s);
        });

        widget!.lazyActions!.emit(
          ElementWidgetActions.HangupCall,
          new CustomEvent(ElementWidgetActions.HangupCall, {
            detail: {
              action: "im.vector.hangup",
              api: "toWidget",
              data: {},
              requestId: "widgetapi-1761237395918",
              widgetId: "mrUjS9T6uKUOWHMxXvLbSv0F",
            },
          }),
        );
      },
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
      },
    );

    const source = await pr.promise;
    expect(source).toBe("user");
  },
);
