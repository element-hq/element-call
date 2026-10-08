/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { Status } from "matrix-js-sdk/lib/matrixrtc";

import { MediaConnectionState } from "../media-backend/api";
import { MatrixRTCError } from "../api";
import {
  type LocalMemberState,
  PublishState,
  TransportState,
} from "./LocalMembership";
import { fatalError, participationStatus } from "./status";

const publishing: LocalMemberState = {
  media: PublishState.Publishing,
  matrix: Status.Connected,
};
const connecting: LocalMemberState = {
  media: { connection: MediaConnectionState.Connecting },
  matrix: Status.Connecting,
};
const error = new MatrixRTCError("gone");

describe("participationStatus", () => {
  it.each<[string, LocalMemberState, boolean, boolean, boolean, string]>([
    [
      "no transport yet",
      TransportState.Waiting,
      false,
      false,
      false,
      "waitingForTransport",
    ],
    ["joining", connecting, false, false, false, "connecting"],
    ["connected", publishing, true, false, false, "connected"],
    [
      "dropped after connecting",
      connecting,
      false,
      true,
      false,
      "reconnecting",
    ],
    ["a transport error", error, false, false, false, "disconnected"],
    [
      "a matrix error",
      { ...publishing, matrix: error },
      true,
      false,
      false,
      "disconnected",
    ],
    ["left", publishing, true, false, true, "left"],
    ["left after an error", error, false, false, true, "left"],
  ])("%s", (_name, state, connected, reconnecting, left, expected) => {
    expect(participationStatus(state, connected, reconnecting, left)).toBe(
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
