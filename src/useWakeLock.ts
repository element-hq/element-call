/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { logger } from "matrix-js-sdk/src/logger";
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
      const onVisibilityChange = async (): Promise<void> => {
        if (document.visibilityState === "visible") {
          try {
            lock = await navigator.wakeLock.request("screen");
            // Handle the edge case where this component unmounts before the
            // promise resolves
            if (!mounted)
              lock
                .release()
                .catch((e) => logger.warn("Can't release wake lock", e));
          } catch (e) {
            logger.warn("Can't acquire wake lock", e);
          }
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
