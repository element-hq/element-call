/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";

/**
 * How the user leaves the call for wherever they came from: the standalone
 * app's home page, with its list of recent calls.
 *
 * The call itself has no idea where that is, or whether there is such a place
 * at all. Standalone there is, and the shell navigates to it; as a component
 * there is not — the host decides what happens after a call — so nothing is
 * supplied, and the call offers no way out of its own. This is what lets the
 * call be rendered without a router.
 */
const LeaveToHomeContext = createContext<(() => void) | null>(null);

export const LeaveToHomeProvider = LeaveToHomeContext.Provider;

/**
 * The way out of the call, or null when there is nowhere to go and the call
 * should not offer one.
 */
export const useLeaveToHome = (): (() => void) | null =>
  use(LeaveToHomeContext);
