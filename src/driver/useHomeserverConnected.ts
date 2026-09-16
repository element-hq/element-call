/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import { Config } from "../config/Config";
import { type MatrixDrivers } from "./MatrixDriverContext";

/**
 * Whether the homeserver is reachable, from the RTC driver's connectivity
 * (the same signal the crate turns into `HomeserverUnreachable`). The driver
 * reports every lapse of the sync loop; the UI should not, so a lapse counts
 * only once it has lasted `graceMs` (the deployment's
 * `sync_disconnect_grace_period_ms` by default). Coming back counts at once.
 *
 * `null` drivers (a host that provided none) read as connected: there is
 * nothing to report on.
 */
export function useHomeserverConnected(
  drivers: MatrixDrivers | null,
  graceMs: number = Config.get().sync_disconnect_grace_period_ms,
): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    if (drivers === null) {
      setConnected(true);
      return;
    }
    const { rtcDriver } = drivers;
    let live = true;
    let lapse: ReturnType<typeof setTimeout> | null = null;
    const report = (isConnected: boolean): void => {
      if (lapse !== null) {
        clearTimeout(lapse);
        lapse = null;
      }
      if (isConnected) setConnected(true);
      else lapse = setTimeout(() => setConnected(false), graceMs);
    };
    report(rtcDriver.isHomeserverConnected());
    rtcDriver.subscribeConnectivity({
      emit: (isConnected) => {
        if (!live) return false;
        report(isConnected);
        return true;
      },
    });
    return (): void => {
      live = false;
      if (lapse !== null) clearTimeout(lapse);
    };
  }, [drivers, graceMs]);
  return connected;
}
