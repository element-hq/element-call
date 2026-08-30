/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { t } from "i18next";
import { type ConnectionError } from "livekit-client";
import { HTTPError, MatrixError } from "matrix-js-sdk";

import { i18nKey } from "./i18n";

export enum ErrorCode {
  /**
   * Configuration problem due to no MatrixRTC transport provided by homeserver and no fallback configured.
   */
  MISSING_MATRIX_RTC_TRANSPORT = "MISSING_MATRIX_RTC_TRANSPORT",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  INTERNAL_MEMBERSHIP_MANAGER = "INTERNAL_MEMBERSHIP_MANAGER",
  FAILED_TO_START_LIVEKIT = "FAILED_TO_START_LIVEKIT",
  /** LiveKit indicates that the server has hit its track limits */
  INSUFFICIENT_CAPACITY_ERROR = "INSUFFICIENT_CAPACITY_ERROR",
  E2EE_NOT_SUPPORTED = "E2EE_NOT_SUPPORTED",
  STICKY_EVENTS_NOT_SUPPORTED = "STICKY_EVENTS_NOT_SUPPORTED",
  OPEN_ID_ERROR = "OPEN_ID_ERROR",
  NO_MATRIX_2_AUTHORIZATION_SERVICE = "NO_MATRIX_2_0_AUTHORIZATION_SERVICE",
  SFU_ERROR = "SFU_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum ErrorCategory {
  /** Calling is not supported, server misconfigured (JWT service missing, no MSC support ...)*/
  CONFIGURATION_ISSUE = "CONFIGURATION_ISSUE",
  NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY",
  CLIENT_CONFIGURATION = "CLIENT_CONFIGURATION",
  UNKNOWN = "UNKNOWN",
  SYSTEM_FAILURE = "SYSTEM_FAILURE",
  // SYSTEM_FAILURE / FEDERATION_FAILURE ..
}

/**
 * Structure for errors that occur when using ElementCall.
 */
export class ElementCallError extends Error {
  public code: ErrorCode;
  public category: ErrorCategory;
  public localisedMessage?: string;
  public localisedTitle: string;

  // Alternative to localisedMessage, for rich error rendering
  public localisedMessageKey?: string;
  public localisedMessageValues?: Record<string, string>;

  protected constructor(
    localisedTitle: string,
    code: ErrorCode,
    category: ErrorCategory,
    localisedMessage?: string,
    cause?: Error,
  ) {
    super(localisedTitle, { cause });
    this.localisedTitle = localisedTitle;
    this.localisedMessage = localisedMessage;
    this.category = category;
    this.code = code;
  }
}

/**
 * Configuration problem due to no MatrixRTC transport provided by homeserver and no fallback configured.
 */
export class MatrixRTCTransportMissingError extends ElementCallError {
  public domain: string;

  /**
   * Creates an instance of MatrixRTCTransportMissingError.
   * @param domain - The domain where the MatrixRTC transport is missing.
   */
  public constructor(domain: string) {
    super(
      t("error.call_is_not_supported"),
      ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.matrix_rtc_transport_missing", {
        domain,
        brand: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
        errorCode: ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      }),
    );
    this.domain = domain;
  }
}

/**
 * Error indicating that the connection to the call was lost and could not be re-established.
 */
export class ConnectionLostError extends ElementCallError {
  /**
   * Creates an instance of ConnectionLostError.
   *
   * @param cause - The underlying error that made us give up on the
   * connection, if there is one. It is not shown to the user directly, but it
   * ends up in the technical details of the error screen and in Sentry.
   */
  public constructor(cause?: Error) {
    super(
      t("error.connection_lost"),
      ErrorCode.CONNECTION_LOST_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
      t("error.connection_lost_description"),
      cause,
    );
  }
}

/**
 * Error indicating a failure in the membership manager causing the join call
 * operation to fail.
 */
export class MembershipManagerError extends ElementCallError {
  /**
   * Creates an instance of MembershipManagerError.
   *
   * @param error - The underlying error that caused the membership manager failure.
   */
  public constructor(error: Error) {
    super(
      t("error.membership_manager"),
      ErrorCode.INTERNAL_MEMBERSHIP_MANAGER,
      ErrorCategory.SYSTEM_FAILURE,
      t("error.membership_manager_description"),
      error,
    );
  }
}

/**
 * Error indicating that this deployment pins `matrix_rtc_mode=matrix_2_0` in
 * config.json but the homeserver does not advertise MSC4354 (sticky events),
 * which the Matrix 2.0 mode requires.
 */
export class StickyEventsRequiredError extends ElementCallError {
  public constructor() {
    super(
      t("error.sticky_events_required"),
      ErrorCode.STICKY_EVENTS_NOT_SUPPORTED,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.sticky_events_required_description"),
    );
  }
}

/**
 * Error indicating that end-to-end encryption is not supported in the current environment.
 */
export class E2EENotSupportedError extends ElementCallError {
  public constructor() {
    super(
      t("error.e2ee_unsupported"),
      ErrorCode.E2EE_NOT_SUPPORTED,
      ErrorCategory.CLIENT_CONFIGURATION,
      t("error.e2ee_unsupported_description"),
    );
  }
}

/**
 * Error indicating an unknown issue occurred during a call operation.
 */
export class UnknownCallError extends ElementCallError {
  /**
   * Creates an instance of UnknownCallError.
   * @param error - The underlying error that caused the unknown issue.
   */
  public constructor(error: Error) {
    super(
      t("error.generic"),
      ErrorCode.UNKNOWN_ERROR,
      ErrorCategory.UNKNOWN,
      undefined,
      // Properly set it as a cause for a better reporting on sentry
      error,
    );
  }
}

/**
 * Error indicating a failure to obtain an OpenID token.
 */
export class FailToGetOpenIdToken extends ElementCallError {
  /**
   * Creates an instance of FailToGetOpenIdToken.
   * @param error - The underlying error that caused the failure.
   */
  public constructor(error: Error) {
    super(
      t("error.generic"),
      ErrorCode.OPEN_ID_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      undefined,
      // Properly set it as a cause for a better reporting on sentry
      error,
    );
  }
}

export class NoMatrix2AuthorizationService extends ElementCallError {
  /**
   * Creates an instance of NoMatrix2_0AuthorizationService.
   * @param error - The underlying error that caused the failure.
   */
  public constructor(error: Error) {
    super(
      t("error.generic"),
      ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.no_matrix_2_authorization_service"),
      // Properly set it as a cause for a better reporting on sentry
      error,
    );
  }
}

/**
 * Error indicating a failure to start publishing on a LiveKit connection.
 */
export class FailToStartLivekitConnection extends ElementCallError {
  /**
   * Creates an instance of FailToStartLivekitConnection.
   * @param e - An optional error message providing additional context.
   */
  public constructor(e?: string) {
    super(
      t("error.failed_to_start_livekit"),
      ErrorCode.FAILED_TO_START_LIVEKIT,
      ErrorCategory.NETWORK_CONNECTIVITY,
      e,
    );
  }
}

/**
 * Error indicating that a LiveKit's server has hit its track limits.
 */
export class InsufficientCapacityError extends ElementCallError {
  public constructor() {
    super(
      t("error.insufficient_capacity"),
      ErrorCode.INSUFFICIENT_CAPACITY_ERROR,
      ErrorCategory.UNKNOWN,
      t("error.insufficient_capacity_description"),
    );
  }
}

/**
 * Error indicating that room creation is restricted by the SFU.
 * Only authorized users can create rooms, so the room must exist before connecting (done by the auth jwt service)
 */
export class SFURoomCreationRestrictedError extends ElementCallError {
  public constructor() {
    super(
      t("error.room_creation_restricted"),
      ErrorCode.SFU_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.room_creation_restricted_description"),
    );
  }
}

/**
 * Error indicating that the SFU peer-to-peer connection timed out.
 */
export class PeerConnectionTimeoutError extends ElementCallError {
  public constructor() {
    super(
      t("error.peer_connection_timeout"),
      ErrorCode.SFU_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
    );
    this.localisedMessageKey = i18nKey(
      "error.peer_connection_timeout_description",
    );
    this.localisedMessageValues = {
      linkUrl:
        "https://docs.element.io/latest/element-server-suite-pro/configuring-components/configuring-matrix-rtc/#sfu-connectivity-troubleshooting",
    };
  }
}

export class LivekitConnectionError extends ElementCallError {
  public constructor(cause: ConnectionError) {
    super(
      t("error.livekit_connection_error"),
      ErrorCode.SFU_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
    );
    this.localisedMessageKey = i18nKey(
      "error.livekit_connection_error_description",
    );
    this.localisedMessageValues = { reason: cause.reasonName };
  }
}

/** Maximum number of `cause` levels walked by {@link describeErrorChain}. */
const MAX_CAUSE_DEPTH = 8;

/** Prefix that `@sentry/react` gives the synthetic error it appends as a cause. */
const SENTRY_WRAPPER_NAME = "React ErrorBoundary ";

/**
 * Describes a single error, including the protocol level details that Matrix
 * and HTTP errors carry but leave out of their `message`.
 */
function describeError(error: unknown): string {
  if (error instanceof MatrixError) {
    // An `M_UNKNOWN` errcode usually means the failure did not come from the
    // homeserver at all: when we run as a widget, the hosting client's widget
    // driver serialises any error it cannot map onto a Matrix error that way
    // (see `MatrixError.asWidgetApiErrorData`). The url and status are then far
    // more telling than the errcode, so always print them.
    const parts = [
      `errcode=${error.errcode ?? "<none>"}`,
      `httpStatus=${error.httpStatus ?? "<none>"}`,
    ];
    if (error.url) parts.push(`url=${error.url}`);
    if (error.error) parts.push(`error=${error.error}`);
    return `MatrixError(${parts.join(", ")}): ${error.message}`;
  }
  if (error instanceof HTTPError)
    return `HTTPError(httpStatus=${error.httpStatus ?? "<none>"}): ${error.message}`;
  if (error instanceof ElementCallError)
    return `ElementCallError(code=${error.code}, category=${error.category}): ${error.localisedTitle}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `Non-error value: ${String(error)}`;
}

/**
 * Renders an error together with its whole `cause` chain.
 *
 * By the time an error reaches the error screen it has usually been wrapped
 * several times over (the MembershipManager scheduler, an
 * {@link ElementCallError} subclass, a context wrapper at the call site, ...),
 * so showing only the outermost error, or a single `cause` hop, tends to hide
 * the request that actually failed.
 *
 * @param error - The error to describe.
 * @returns One entry per error in the chain, outermost wrapper first. A chain
 * of length one means we have nothing beyond the error itself to report.
 */
export function describeErrorChain(error: unknown): string[] {
  const lines: string[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    current !== undefined && depth < MAX_CAUSE_DEPTH;
    depth++
  ) {
    // `@sentry/react` appends a synthetic error to the end of the chain to
    // carry the React component stack. That is useful in Sentry, but here it
    // only repeats the message of the error it is attached to.
    if (
      current instanceof Error &&
      current.name.startsWith(SENTRY_WRAPPER_NAME)
    )
      break;
    lines.push(
      (depth === 0 ? "" : `${"  ".repeat(depth)}caused by: `) +
        describeError(current),
    );
    // Only `Error`s carry a `cause`, and a self-referencing one would loop.
    if (!(current instanceof Error) || current.cause === current) break;
    current = current.cause;
  }
  return lines;
}
