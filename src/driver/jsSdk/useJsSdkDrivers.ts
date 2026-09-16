/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { useEffect, useMemo } from "react";

import { type MatrixDrivers } from "../MatrixDriverContext";
import { JsSdkElementCallMatrixClientDriver } from "./JsSdkElementCallMatrixClientDriver";
import { JsSdkRtcMatrixDriver } from "./JsSdkRtcMatrixDriver";

/**
 * The two matrix-js-sdk drivers for a room, for as long as the client and
 * room stay the same. The RTC driver hooks listeners on the client for the
 * crate's sinks; they are let go of when the drivers are replaced or the
 * caller unmounts.
 */
export function useJsSdkDrivers(
  client: MatrixClient,
  room: Room,
): MatrixDrivers {
  const drivers = useMemo(
    (): MatrixDrivers => ({
      rtcDriver: new JsSdkRtcMatrixDriver(client, room),
      clientDriver: new JsSdkElementCallMatrixClientDriver(client, room),
    }),
    [client, room],
  );
  useEffect(
    () => (): void => (drivers.rtcDriver as JsSdkRtcMatrixDriver).detach(),
    [drivers],
  );
  return drivers;
}
