/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { MatrixRTCMode } from "../../config/ConfigOptions";
import { type MatrixDrivers } from "../../driver/MatrixDriverContext";
import { MockElementCallMatrixClientDriver } from "../../driver/MockElementCallMatrixClientDriver";
import { MockRtcMatrixDriver } from "../../driver/MockRtcMatrixDriver";
import { initMatrixRtcSdkForTests } from "../../utils/test-matrix-rtc";
import { participationConfig } from "./joinParams";
import { useCallParticipation } from "./useCallParticipation";

const config = participationConfig({
  mode: MatrixRTCMode.Matrix_2_0,
  manageMediaKeys: false,
  session: {
    delayed_leave: { delay_ms: 15_000 },
    delegated_delayed_leave: { delay_ms: 3_600_000 },
    network_error_retry_ms: 1000,
  },
});

describe("useCallParticipation", () => {
  beforeAll(async () => {
    await initMatrixRtcSdkForTests();
  });

  it("creates a participation for the drivers and ends it on unmount", async () => {
    const drivers: MatrixDrivers = {
      rtcDriver: new MockRtcMatrixDriver(),
      clientDriver: new MockElementCallMatrixClientDriver(),
    };
    const { result, rerender, unmount } = renderHook(
      ({ drivers }) => useCallParticipation(drivers, config),
      { initialProps: { drivers: null as MatrixDrivers | null } },
    );
    // Nothing without drivers (matrix-js-sdk carries the call).
    expect(result.current).toBeNull();

    rerender({ drivers });
    await waitFor(() => expect(result.current).not.toBeNull());
    const participation = result.current!;
    // It seeds the session from the driver right away.
    await waitFor(() => expect(participation.session$.value.seeded).toBe(true));

    unmount();
    // Ended: the manager is gone, its diagnostics say nothing.
    expect(participation.debugSnapshot()).toBe("{}");
  });
});
