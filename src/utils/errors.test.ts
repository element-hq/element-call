/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { ConnectionError } from "livekit-client";
import {
  ErrorCode as RTCErrorCode,
  FailToGetOpenIdToken as RTCFailToGetOpenIdToken,
  FailToStartLivekitConnection as RTCFailToStartLivekitConnection,
  InsufficientCapacityError as RTCInsufficientCapacityError,
  LivekitConnectionError as RTCLivekitConnectionError,
  MatrixRTCError,
  MatrixRTCTransportMissingError as RTCTransportMissingError,
  MembershipManagerError as RTCMembershipManagerError,
  NoMatrix2AuthorizationService as RTCNoMatrix2AuthorizationService,
  PeerConnectionTimeoutError as RTCPeerConnectionTimeoutError,
  SFURoomCreationRestrictedError as RTCSFURoomCreationRestrictedError,
  UnknownRTCError,
} from "@element-hq/matrixrtc-sdk";

import {
  ConnectionLostError,
  ErrorCategory,
  ErrorCode,
  FailToGetOpenIdToken,
  FailToStartLivekitConnection,
  fromMatrixRTCError,
  InsufficientCapacityError,
  LivekitConnectionError,
  MatrixRTCTransportMissingError,
  MembershipManagerError,
  NoMatrix2AuthorizationService,
  PeerConnectionTimeoutError,
  SFURoomCreationRestrictedError,
  UnknownCallError,
} from "./errors";

// These errors take their wording from Element Call's own i18next instance
// rather than the global one, so each needs to come out translated rather than
// as a raw key.
describe("localised errors", () => {
  test("MembershipManagerError describes the failure and keeps its cause", () => {
    const cause = new Error("the underlying problem");
    const error = new MembershipManagerError(cause);

    expect(error.code).toBe(ErrorCode.INTERNAL_MEMBERSHIP_MANAGER);
    expect(error.category).toBe(ErrorCategory.SYSTEM_FAILURE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
    expect(error.cause).toBe(cause);
  });

  test("NoMatrix2AuthorizationService is a configuration problem", () => {
    const cause = new Error("404");
    const error = new NoMatrix2AuthorizationService(cause);

    expect(error.code).toBe(ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION_ISSUE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
    expect(error.cause).toBe(cause);
  });

  test("FailToStartLivekitConnection passes its detail through", () => {
    const error = new FailToStartLivekitConnection("could not publish");

    expect(error.code).toBe(ErrorCode.FAILED_TO_START_LIVEKIT);
    expect(error.category).toBe(ErrorCategory.NETWORK_CONNECTIVITY);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).toBe("could not publish");
  });

  test("SFURoomCreationRestrictedError explains the restriction", () => {
    const error = new SFURoomCreationRestrictedError();

    expect(error.code).toBe(ErrorCode.SFU_ERROR);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION_ISSUE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
  });
});

// The SDK reports failures as its own error classes; the app turns each into
// the translated error it shows, so every class the SDK can throw needs a
// counterpart with a title and no raw i18n key leaking through.
describe("fromMatrixRTCError", () => {
  const cause = new Error("the underlying problem");

  test.each([
    {
      name: "missing transport",
      input: new RTCTransportMissingError("example.org"),
      expected: MatrixRTCTransportMissingError,
      code: ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
    },
    {
      name: "membership manager failure",
      input: new RTCMembershipManagerError(cause),
      expected: MembershipManagerError,
      code: ErrorCode.INTERNAL_MEMBERSHIP_MANAGER,
    },
    {
      name: "OpenID token failure",
      input: new RTCFailToGetOpenIdToken(cause),
      expected: FailToGetOpenIdToken,
      code: ErrorCode.OPEN_ID_ERROR,
    },
    {
      name: "missing authorization service",
      input: new RTCNoMatrix2AuthorizationService(cause),
      expected: NoMatrix2AuthorizationService,
      code: ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE,
    },
    {
      name: "LiveKit start failure",
      input: new RTCFailToStartLivekitConnection("could not publish"),
      expected: FailToStartLivekitConnection,
      code: ErrorCode.FAILED_TO_START_LIVEKIT,
    },
    {
      name: "insufficient capacity",
      input: new RTCInsufficientCapacityError(),
      expected: InsufficientCapacityError,
      code: ErrorCode.INSUFFICIENT_CAPACITY_ERROR,
    },
    {
      name: "restricted room creation",
      input: new RTCSFURoomCreationRestrictedError(),
      expected: SFURoomCreationRestrictedError,
      code: ErrorCode.SFU_ERROR,
    },
    {
      name: "peer connection timeout",
      input: new RTCPeerConnectionTimeoutError(),
      expected: PeerConnectionTimeoutError,
      code: ErrorCode.SFU_ERROR,
    },
    {
      name: "LiveKit connection failure",
      input: new RTCLivekitConnectionError(
        ConnectionError.timeout("signalling timed out"),
      ),
      expected: LivekitConnectionError,
      code: ErrorCode.SFU_ERROR,
    },
    {
      name: "lost connection",
      input: new MatrixRTCError("gone", RTCErrorCode.CONNECTION_LOST_ERROR),
      expected: ConnectionLostError,
      code: ErrorCode.CONNECTION_LOST_ERROR,
    },
    {
      name: "anything else",
      input: new UnknownRTCError(cause),
      expected: UnknownCallError,
      code: ErrorCode.UNKNOWN_ERROR,
    },
  ])("maps a $name to the app's error", ({ input, expected, code }) => {
    const error = fromMatrixRTCError(input);

    expect(error).toBeInstanceOf(expected);
    expect(error.code).toBe(code);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage ?? "").not.toContain("error.");
  });

  test("keeps the SDK error's cause for reporting", () => {
    const error = fromMatrixRTCError(new RTCMembershipManagerError(cause));

    expect(error.cause).toBe(cause);
  });

  test("keeps the SDK error itself as the cause when it has none", () => {
    const input = new MatrixRTCError("no cause attached");
    const error = fromMatrixRTCError(input);

    expect(error).toBeInstanceOf(UnknownCallError);
    expect(error.cause).toBe(input);
  });

  test("keeps the LiveKit reason in the connection error's description", () => {
    const error = fromMatrixRTCError(
      new RTCLivekitConnectionError(ConnectionError.timeout("timed out")),
    );

    expect(error.localisedMessageKey).toBe(
      "error.livekit_connection_error_description",
    );
    expect(error.localisedMessageValues?.reason).toBe("Timeout");
  });
});
