/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMediaQuery } from "./useMediaQuery";

/**
 * @returns Whether the user has requested reduced motion.
 */
export const usePrefersReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion)");
