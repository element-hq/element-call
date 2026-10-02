/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * This file contains helper functions and types for the legacy SDK bundle.
 */

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { type WidgetHelpers } from "../src/widget";

export const tryMakeSticky = (widget: WidgetHelpers): void => {
  const logger = rootLogger.getChild("[MatrixRTCSdk]");
  logger.info("try making sticky MatrixRTCSdk");
  void widget.api
    .setAlwaysOnScreen(true)
    .then(() => {
      logger.info("sticky MatrixRTCSdk");
    })
    .catch((error) => {
      logger.error("failed to make sticky MatrixRTCSdk", error);
    });
};
/** The data channel topic this bundle has always used, so that old and new builds talk. */
export const TEXT_LK_TOPIC = "matrixRTC";
