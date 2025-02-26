/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export enum ErrorCode {
  /**
   * Configuration problem due to no MatrixRTC backend/SFU is exposed via .well-known and no fallback configured.
   */
  MISSING_LIVE_KIT_SERVICE_URL = "MISSING_LIVE_KIT_SERVICE_URL",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Structure for errors that occur when using ElementCall.
 */
export class ElementCallError extends Error {
  public code: ErrorCode;

  public constructor(message: string, code: ErrorCode) {
    super(message);
    this.code = code;
  }
}

export class ConnectionLostError extends ElementCallError {
  public constructor() {
    super("Connection lost", ErrorCode.CONNECTION_LOST_ERROR);
  }
}
