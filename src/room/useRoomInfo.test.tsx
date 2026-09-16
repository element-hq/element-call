/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ReactNode } from "react";

import { MatrixDriverProvider } from "../driver/MatrixDriverContext";
import { MockElementCallMatrixClientDriver } from "../driver/MockElementCallMatrixClientDriver";
import { MockRtcMatrixDriver } from "../driver/MockRtcMatrixDriver";
import { useOwnProfile } from "../profile/useOwnProfile";
import { useRoomInfo } from "./useRoomInfo";

function providing(clientDriver: MockElementCallMatrixClientDriver) {
  return ({ children }: { children: ReactNode }): ReactNode => (
    <MatrixDriverProvider
      value={{ rtcDriver: new MockRtcMatrixDriver(), clientDriver }}
    >
      {children}
    </MatrixDriverProvider>
  );
}

describe("useRoomInfo", () => {
  it("reads the room from the client driver and follows its changes", () => {
    const clientDriver = new MockElementCallMatrixClientDriver({
      roomInfo: { name: "Mission Control", joinRule: "invite" },
    });
    const { result } = renderHook(() => useRoomInfo(), {
      wrapper: providing(clientDriver),
    });
    expect(result.current).toMatchObject({
      name: "Mission Control",
      joinRule: "invite",
    });
    act(() => clientDriver.setRoomInfo({ name: "Launch Control" }));
    expect(result.current.name).toBe("Launch Control");
  });

  it("throws without drivers", () => {
    expect(() => renderHook(() => useRoomInfo())).toThrow(/No Matrix drivers/);
  });
});

describe("useOwnProfile", () => {
  it("reads our own profile and follows its changes", () => {
    const clientDriver = new MockElementCallMatrixClientDriver({
      ownProfile: { displayName: "Me", avatarUrl: "mxc://x/me" },
    });
    const { result } = renderHook(() => useOwnProfile(), {
      wrapper: providing(clientDriver),
    });
    expect(result.current).toEqual({
      displayName: "Me",
      avatarUrl: "mxc://x/me",
    });
    act(() => clientDriver.setOwnProfile({ displayName: "Myself" }));
    expect(result.current.displayName).toBe("Myself");
  });
});
