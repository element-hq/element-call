/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { FfiLogLevel, type LogSink, setLogSink } from "@element-hq/matrix-rtc";

/**
 * A {@link LogSink} that writes the crate's lines to a matrix-js-sdk logger,
 * so they land in the same console and rageshake as everything else, under
 * the logger's own level filtering. Each line names the Rust module it came
 * from.
 */
export function matrixRtcLogSink(target: Logger): LogSink {
  return {
    log(level, module, message): void {
      const line = `[${module}] ${message}`;
      switch (level) {
        case FfiLogLevel.Error:
          target.error(line);
          break;
        case FfiLogLevel.Warn:
          target.warn(line);
          break;
        case FfiLogLevel.Info:
          target.info(line);
          break;
        case FfiLogLevel.Debug:
          target.debug(line);
          break;
        case FfiLogLevel.Trace:
          target.trace(line);
          break;
      }
    },
  };
}

/**
 * Routes the crate's log lines to `[matrix-rtc]` under Element Call's root
 * logger. `maxLevel` is the crate-side cut-off: what it does not format it
 * does not send, so trace stays off unless asked for.
 */
export function installMatrixRtcLogSink(
  maxLevel: FfiLogLevel = FfiLogLevel.Debug,
): void {
  setLogSink(
    matrixRtcLogSink(rootLogger.getChild("[matrix-rust-rtc]")),
    maxLevel,
  );
}
