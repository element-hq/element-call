/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { Status } from "matrix-js-sdk/lib/matrixrtc";

import { MediaConnectionState } from "../backend/api";
import { MatrixRTCError } from "../api";
import {
  type LocalMemberState,
  PublishState,
  TransportState,
} from "./LocalMember";
import { fatalError, sessionStatus } from "./status";

const publishing: LocalMemberState = {
  media: PublishState.Publishing,
  matrix: Status.Connected,
};
const connecting: LocalMemberState = {
  media: { connection: MediaConnectionState.Connecting },
  matrix: Status.Connecting,
};
const error = new MatrixRTCError("gone");

describe("sessionStatus", () => {
  it.each<[string, LocalMemberState, boolean, boolean, boolean, string]>([
    [
      "no transport yet",
      TransportState.Waiting,
      true,
      false,
      false,
      "waitingForTransport",
    ],
    ["not asked to join", connecting, false, false, false, "disconnected"],
    ["joining", connecting, true, false, false, "connecting"],
    ["connected", publishing, true, true, false, "connected"],
    ["dropped after connecting", connecting, true, false, true, "reconnecting"],
    ["a transport error", error, true, false, false, "disconnected"],
    [
      "a matrix error",
      { ...publishing, matrix: error },
      true,
      true,
      false,
      "disconnected",
    ],
  ])("%s", (_name, state, joinRequested, connected, reconnecting, expected) => {
    expect(sessionStatus(state, joinRequested, connected, reconnecting)).toBe(
      expected,
    );
  });
});

describe("fatalError", () => {
  it("is null while nothing is wrong", () => {
    expect(fatalError(TransportState.Waiting)).toBeNull();
    expect(fatalError(publishing)).toBeNull();
  });

  it("finds the error wherever the state holds it", () => {
    expect(fatalError(error)).toBe(error);
    expect(fatalError({ ...publishing, matrix: error })).toBe(error);
    expect(
      fatalError({ media: { connection: error }, matrix: Status.Connected }),
    ).toBe(error);
  });

  it("does not treat a publish error as fatal", () => {
    expect(fatalError({ media: error, matrix: Status.Connected })).toBeNull();
  });
});
