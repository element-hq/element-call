/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";

import { type ElementCallMatrixClientDriver } from "./ElementCallMatrixClientDriver";
import { type RtcMatrixDriver } from "./RtcMatrixDriver";

/** The host's two drivers for the room a call is in. */
export interface MatrixDrivers {
  rtcDriver: RtcMatrixDriver;
  clientDriver: ElementCallMatrixClientDriver;
}

const MatrixDriverContext = createContext<MatrixDrivers | null>(null);

/**
 * Makes the drivers available to the call tree. Every host that renders a
 * `CallView` provides them: the component from its props, the standalone
 * app and the widget from the matrix-js-sdk drivers over their client.
 */
export const MatrixDriverProvider = MatrixDriverContext.Provider;

/** The drivers, or null where no host provided any (a test rendering a leaf). */
export function useOptionalMatrixDrivers(): MatrixDrivers | null {
  return use(MatrixDriverContext);
}

/** The drivers; throws where none were provided. */
export function useMatrixDrivers(): MatrixDrivers {
  const drivers = useOptionalMatrixDrivers();
  if (drivers === null)
    throw new Error(
      "No Matrix drivers were provided; wrap the call in a MatrixDriverProvider",
    );
  return drivers;
}
