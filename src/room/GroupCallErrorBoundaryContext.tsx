/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext } from "react";

import { type ElementCallError } from "../utils/errors.ts";

export type GroupCallErrorBoundaryContextType = {
  subscribe: (cb: (error: ElementCallError) => void) => () => void;
  notifyHandled: (error: ElementCallError) => void;
};

export const GroupCallErrorBoundaryContext =
  createContext<GroupCallErrorBoundaryContextType | null>(null);
