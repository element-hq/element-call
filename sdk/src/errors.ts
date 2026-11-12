/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ConnectionError } from "livekit-client";

export enum ErrorCode {
  /** No MatrixRTC transport provided by the homeserver and no fallback configured. */
  MISSING_MATRIX_RTC_TRANSPORT = "MISSING_MATRIX_RTC_TRANSPORT",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  INTERNAL_MEMBERSHIP_MANAGER = "INTERNAL_MEMBERSHIP_MANAGER",
  FAILED_TO_START_LIVEKIT = "FAILED_TO_START_LIVEKIT",
  /** LiveKit indicates that the server has hit its track limits. */
  INSUFFICIENT_CAPACITY_ERROR = "INSUFFICIENT_CAPACITY_ERROR",
  OPEN_ID_ERROR = "OPEN_ID_ERROR",
  NO_MATRIX_2_AUTHORIZATION_SERVICE = "NO_MATRIX_2_0_AUTHORIZATION_SERVICE",
  SFU_ERROR = "SFU_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum ErrorCategory {
  /** Calling is not supported, the server is misconfigured (JWT service missing, no MSC support). */
  CONFIGURATION_ISSUE = "CONFIGURATION_ISSUE",
  NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY",
  CLIENT_CONFIGURATION = "CLIENT_CONFIGURATION",
  UNKNOWN = "UNKNOWN",
  SYSTEM_FAILURE = "SYSTEM_FAILURE",
}

/**
 * An error raised by the client. `code` says what went wrong in a form a host
 * can translate; `cause` holds the underlying error where there is one.
 */
export class MatrixRTCError extends Error {
  public constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    public readonly category: ErrorCategory = ErrorCategory.UNKNOWN,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MatrixRTCError";
  }
}

/** Wraps whatever a backend threw into the SDK's error type, keeping it as the cause. */
export function toMatrixRTCError(error: unknown): MatrixRTCError {
  if (error instanceof MatrixRTCError) return error;
  if (error instanceof Error)
    return new MatrixRTCError(
      error.message || error.name,
      ErrorCode.UNKNOWN_ERROR,
      ErrorCategory.UNKNOWN,
      { cause: error },
    );
  return new MatrixRTCError(String(error));
}

export class MatrixRTCTransportMissingError extends MatrixRTCError {
  public constructor(public readonly domain: string) {
    super(
      `The homeserver ${domain} advertises no MatrixRTC transport`,
      ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      ErrorCategory.CONFIGURATION_ISSUE,
    );
  }
}

export class MembershipManagerError extends MatrixRTCError {
  public constructor(cause: Error) {
    super(
      `The membership manager stopped: ${cause.message}`,
      ErrorCode.INTERNAL_MEMBERSHIP_MANAGER,
      ErrorCategory.SYSTEM_FAILURE,
      { cause },
    );
  }
}

export class UnknownRTCError extends MatrixRTCError {
  public constructor(cause: Error) {
    super(
      cause.message || "Unknown error",
      ErrorCode.UNKNOWN_ERROR,
      ErrorCategory.UNKNOWN,
      {
        cause,
      },
    );
  }
}

export class FailToGetOpenIdToken extends MatrixRTCError {
  public constructor(cause: Error) {
    super(
      cause instanceof MatrixRTCError
        ? cause.message
        : `Could not authenticate with the transport: ${cause.message}`,
      ErrorCode.OPEN_ID_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      { cause },
    );
  }
}

export class NoMatrix2AuthorizationService extends MatrixRTCError {
  public constructor(cause: Error) {
    super(
      "The transport's authorization service does not support Matrix 2.0",
      ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE,
      ErrorCategory.CONFIGURATION_ISSUE,
      { cause },
    );
  }
}

export class FailToStartLivekitConnection extends MatrixRTCError {
  public constructor(detail?: string) {
    super(
      `Failed to start the media connection${detail ? `: ${detail}` : ""}`,
      ErrorCode.FAILED_TO_START_LIVEKIT,
      ErrorCategory.NETWORK_CONNECTIVITY,
    );
  }
}

export class InsufficientCapacityError extends MatrixRTCError {
  public constructor() {
    super(
      "The media server has no capacity left",
      ErrorCode.INSUFFICIENT_CAPACITY_ERROR,
      ErrorCategory.UNKNOWN,
    );
  }
}

export class SFURoomCreationRestrictedError extends MatrixRTCError {
  public constructor() {
    super(
      "The media server did not let this client create the room",
      ErrorCode.SFU_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
    );
  }
}

export class PeerConnectionTimeoutError extends MatrixRTCError {
  public constructor() {
    super(
      "Timed out establishing the media connection",
      ErrorCode.SFU_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
    );
  }
}

export class LivekitConnectionError extends MatrixRTCError {
  public constructor(cause: ConnectionError) {
    super(
      `Could not connect to the media server: ${cause.message}`,
      ErrorCode.SFU_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
      { cause },
    );
  }
}
