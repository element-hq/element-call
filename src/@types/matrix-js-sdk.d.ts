/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  type ElementCallReactionEventType,
  type ECallReactionEventContent,
} from "../reactions";

// Extend Matrix JS SDK types via Typescript declaration merging to support unspecced event fields and types
declare module "matrix-js-sdk/src/types" {
  export interface TimelineEvents {
    [ElementCallReactionEventType]: ECallReactionEventContent;
  }
}
