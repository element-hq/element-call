/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { type MatrixDrivers } from "../../driver/MatrixDriverContext";
import {
  type FfiParticipationConfig,
  initMatrixRtcSdk,
} from "../../matrix-rtc-sdk";
import { ObservableScope } from "../ObservableScope";
import {
  RtcParticipationManager,
  type RtcParticipationManagerOptions,
} from "./RtcParticipationManager";

/**
 * A {@link RtcParticipationManager} for the mounted call view: created when the
 * drivers or the configuration change, ended (leaving the session if still
 * joined) when the view unmounts. Null for the first render, like the other
 * scoped objects the views own.
 *
 * Owned by `CallView` rather than the in-call view so that the lobby already
 * sees the roster and a rejoin does not rebuild the session seed.
 *
 * The SDK's wasm is loaded here, on first use, rather than at app start: the
 * matrix-js-sdk implementation must not pay for the crate's ~6.5 MB
 * (oxidation plan §5.15), and the load is idempotent, so a rejoin or a later
 * call finds it already booted. A failed load is thrown from the hook so the
 * nearest error boundary shows it instead of the call silently never
 * starting.
 */
export function useRtcParticipationManager(
  drivers: MatrixDrivers | null,
  config: FfiParticipationConfig | null,
  options: Omit<RtcParticipationManagerOptions, "config"> = {},
): RtcParticipationManager | null {
  const [rtcParticipationManager, setParticipation] =
    useState<RtcParticipationManager | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const { transportFallbackUrl, slotId } = options;
  useEffect(() => {
    if (drivers === null || config === null) return;
    const scope = new ObservableScope();
    const { clientDriver, rtcDriver } = drivers;
    // Whether the view is still mounted with these inputs by the time the
    // SDK is ready; if not, nothing is created and the scope is already over.
    let ended = false;
    initMatrixRtcSdk().then(
      () => {
        if (ended) return;
        logger.info(
          `[Lifecycle] Creating the call participation for ${clientDriver.roomId} (compat ${config.compat})`,
        );
        const rtcParticipationManager = new RtcParticipationManager(
          scope,
          rtcDriver,
          clientDriver.roomId,
          clientDriver.userId,
          clientDriver.deviceId,
          { config, transportFallbackUrl, slotId },
        );
        setParticipation(rtcParticipationManager);
      },
      (e: unknown) => {
        if (ended) return;
        logger.error("[Lifecycle] Failed to load the MatrixRTC SDK", e);
        setLoadError(e);
      },
    );
    return (): void => {
      ended = true;
      logger.info("[Lifecycle] Ending the call participation");
      setParticipation(null);
      scope.end();
    };
  }, [drivers, config, transportFallbackUrl, slotId]);
  if (loadError !== null) throw loadError;
  return rtcParticipationManager;
}
