/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { t } from "i18next";

export enum ErrorCode {
  /**
   * Configuration problem due to no MatrixRTC backend/SFU is exposed via .well-known and no fallback configured.
   */
  MISSING_MATRIX_RTC_TRANSPORT = "MISSING_MATRIX_RTC_TRANSPORT",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  /** LiveKit indicates that the server has hit its track limits */
  INSUFFICIENT_CAPACITY_ERROR = "INSUFFICIENT_CAPACITY_ERROR",
  E2EE_NOT_SUPPORTED = "E2EE_NOT_SUPPORTED",
  OPEN_ID_ERROR = "OPEN_ID_ERROR",
  SFU_ERROR = "SFU_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum ErrorCategory {
  /** Calling is not supported, server misconfigured (JWT service missing, no MSC support ...)*/
  CONFIGURATION_ISSUE = "CONFIGURATION_ISSUE",
  NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY",
  CLIENT_CONFIGURATION = "CLIENT_CONFIGURATION",
  UNKNOWN = "UNKNOWN",
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

export class MatrixRTCTransportMissingError extends ElementCallError {
  public domain: string;

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

export class ConnectionLostError extends ElementCallError {
  public constructor() {
    super(
      t("error.connection_lost"),
      ErrorCode.CONNECTION_LOST_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
      t("error.connection_lost_description"),
    );
  }
}

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

export class UnknownCallError extends ElementCallError {
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

export class FailToGetOpenIdToken extends ElementCallError {
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
