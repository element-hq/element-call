/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect } from "react";
import { createLocalMedia, type LocalMedia } from "@element-hq/matrixrtc-sdk";

import { useInitial } from "./useInitial";

/**
 * Local media for the lobby to open and the join to take over, released with
 * the component where the join never comes.
 */
export function useLocalMedia(): LocalMedia {
  const media = useInitial(() => createLocalMedia());
  useEffect(() => (): void => media.stop(), [media]);
  return media;
}
