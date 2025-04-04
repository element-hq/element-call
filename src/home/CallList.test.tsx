/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, type RenderResult } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CallList } from "../../src/home/CallList";
import { type GroupCallRoom } from "../../src/home/useGroupCallRooms";

describe("CallList", () => {
  const renderComponent = (rooms: GroupCallRoom[]): RenderResult => {
    return render(
      <MemoryRouter>
        <CallList client={{} as MatrixClient} rooms={rooms} />
      </MemoryRouter>,
    );
  };

  it("should show room", () => {
    const rooms = [
      {
        roomName: "Room #1",
        roomAlias: "#room-name:server.org",
        room: {
          roomId: "!roomId",
        },
      },
    ] as GroupCallRoom[];

    const result = renderComponent(rooms);

    expect(result.queryByText("Room #1")).toBeTruthy();
  });
});
