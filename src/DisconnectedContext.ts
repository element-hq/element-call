/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";

import { type Behavior, constant } from "./state/Behavior";
import { useBehavior } from "./useBehavior";

// Without a provider there is no client whose connection could fail
const DisconnectedContext = createContext<Behavior<boolean>>(constant(false));

export const DisconnectedProvider = DisconnectedContext.Provider;

/** Whether the signed-in client is failing to reach its homeserver. */
export const useDisconnected = (): boolean =>
  useBehavior(use(DisconnectedContext));
