/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render, RenderResult } from "@testing-library/react";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CallList } from "../../src/home/CallList";
import { GroupCallRoom } from "../../src/home/useGroupCallRooms";

describe("CallList", () => {
  const renderComponent = (rooms: GroupCallRoom[]): RenderResult => {
    return render(
      <MemoryRouter>
        <CallList client={{} as MatrixClient} rooms={rooms} />
      </MemoryRouter>,
    );
  };

  it("should show room", async () => {
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
