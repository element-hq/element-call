/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * This file contains helper functions and types for the MatrixRTC SDK.
 */

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { scan } from "rxjs";

import { type WidgetHelpers } from "../src/widget";
import { type LivekitRoomItem } from "../src/state/CallViewModel/CallViewModel";

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
export const TEXT_LK_TOPIC = "matrixRTC";
/**
 * simple helper operator to combine the last emitted and the current emitted value of a rxjs observable
 *
 * I think there should be a builtin for this but i did not find it...
 */
export const currentAndPrev = scan<
  LivekitRoomItem[],
  {
    prev: LivekitRoomItem[];
    current: LivekitRoomItem[];
  }
>(
  ({ current: lastCurrentVal }, items) => ({
    prev: lastCurrentVal,
    current: items,
  }),
  {
    prev: [],
    current: [],
  },
);
