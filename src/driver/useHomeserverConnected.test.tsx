/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type MatrixDrivers } from "./MatrixDriverContext";
import { MockElementCallMatrixClientDriver } from "./MockElementCallMatrixClientDriver";
import { MockRtcMatrixDriver } from "./MockRtcMatrixDriver";
import { useHomeserverConnected } from "./useHomeserverConnected";

describe("useHomeserverConnected", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a lapse only after the grace period, and a return at once", () => {
    const rtcDriver = new MockRtcMatrixDriver();
    const drivers: MatrixDrivers = {
      rtcDriver,
      clientDriver: new MockElementCallMatrixClientDriver(),
    };
    const { result } = renderHook(() => useHomeserverConnected(drivers, 1000));
    expect(result.current).toBe(true);

    act(() => rtcDriver.setHomeserverConnected(false));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);

    act(() => rtcDriver.setHomeserverConnected(true));
    expect(result.current).toBe(true);

    // A blip shorter than the grace period is never shown.
    act(() => rtcDriver.setHomeserverConnected(false));
    act(() => vi.advanceTimersByTime(500));
    act(() => rtcDriver.setHomeserverConnected(true));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);
  });

  it("starts from the driver's current answer", () => {
    const rtcDriver = new MockRtcMatrixDriver();
    rtcDriver.setHomeserverConnected(false);
    const drivers: MatrixDrivers = {
      rtcDriver,
      clientDriver: new MockElementCallMatrixClientDriver(),
    };
    const { result } = renderHook(() => useHomeserverConnected(drivers, 1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it("is connected without drivers", () => {
    const { result } = renderHook(() => useHomeserverConnected(null, 1000));
    expect(result.current).toBe(true);
  });
});
