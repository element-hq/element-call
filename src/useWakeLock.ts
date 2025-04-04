/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { useEffect } from "react";

/**
 * React hook that inhibits the device from automatically going to sleep.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if ("wakeLock" in navigator) {
      let mounted = true;
      let lock: WakeLockSentinel | null = null;

      // The lock is automatically released whenever the window goes invisible,
      // so we need to reacquire it on visibility changes
      const onVisibilityChange = (): void => {
        if (document.visibilityState === "visible") {
          navigator.wakeLock.request("screen").then(
            (newLock) => {
              lock = newLock;
              // Handle the edge case where this component unmounts before the
              // promise resolves
              if (!mounted)
                lock
                  .release()
                  .catch((e) => logger.warn("Can't release wake lock", e));
            },
            (e) => {
              logger.warn("Can't acquire wake lock", e);
            },
          );
        }
      };

      onVisibilityChange();
      document.addEventListener("visibilitychange", onVisibilityChange);

      return (): void => {
        mounted = false;
        if (lock !== null)
          lock
            .release()
            .catch((e) => logger.warn("Can't release wake lock", e));
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }
  }, []);
}
