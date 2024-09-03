/*
Copyright 2022 New Vector Ltd

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
