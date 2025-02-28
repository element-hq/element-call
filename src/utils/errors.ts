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
  MISSING_MATRIX_RTC_FOCUS = "MISSING_MATRIX_RTC_FOCUS",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum ErrorCategory {
  /** Calling is not supported, server misconfigured (JWT service missing, no MSC support ...)*/
  CONFIGURATION_ISSUE = "CONFIGURATION_ISSUE",
  NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY",
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

  public constructor(
    name: string,
    code: ErrorCode,
    category: ErrorCategory,
    localisedMessage?: string,
  ) {
    super(name);
    this.localisedMessage = localisedMessage;
    this.category = category;
    this.code = code;
  }
}

export class MatrixRTCFocusMissingError extends ElementCallError {
  public domain: string;

  public constructor(domain: string) {
    super(
      "MatrixRTCFocusMissingError",
      ErrorCode.MISSING_MATRIX_RTC_FOCUS,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.matrix_rtc_focus_missing", {
        domain,
        brand: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
        errorCode: ErrorCode.MISSING_MATRIX_RTC_FOCUS,
      }),
    );
    this.domain = domain;
  }
}

export class ConnectionLostError extends ElementCallError {
  public constructor() {
    super(
      "Connection lost",
      ErrorCode.CONNECTION_LOST_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
    );
  }
}
