/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, it } from "vitest";
import {
  type MatrixEvent,
  type Room as MatrixRoom,
  type RoomState,
  RoomStateEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from "matrix-js-sdk";

import { ObservableScope } from "../ObservableScope";
import { mockMatrixRoom, withTestScheduler } from "../../utils/test";
import { createFunctionalMembers$ } from "./FunctionalMembers";

describe("createFunctionalMembers$", () => {
  let scope: ObservableScope;
  let room: MatrixRoom;
  let serviceMembers: string[] | undefined;

  beforeEach(() => {
    scope = new ObservableScope();
    serviceMembers = undefined;
    room = mockMatrixRoom({
      currentState: {
        getStateEvents: () =>
          serviceMembers === undefined
            ? null
            : ({
                getContent: () => ({ service_members: serviceMembers }),
              } as unknown as MatrixEvent),
      } as unknown as RoomState,
    });
  });

  afterEach(() => scope.end());

  function emitStateEvent(type: string): void {
    room.emit(
      RoomStateEvent.Events,
      { getType: () => type } as unknown as MatrixEvent,
      {} as RoomState,
      null,
    );
  }

  it("is empty without a functional members event", () => {
    withTestScheduler(({ expectObservable }) => {
      expectObservable(createFunctionalMembers$(scope, room)).toBe("a", {
        a: new Set(),
      });
    });
  });

  it("tracks the functional members event", () => {
    withTestScheduler(({ expectObservable, schedule }) => {
      serviceMembers = ["@bot:example.com"];
      const functional$ = createFunctionalMembers$(scope, room);
      schedule("-a", {
        a: () => {
          serviceMembers = ["@bot:example.com", "@bot2:example.com"];
          emitStateEvent(UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name);
        },
      });
      expectObservable(functional$).toBe("ab", {
        a: new Set(["@bot:example.com"]),
        b: new Set(["@bot:example.com", "@bot2:example.com"]),
      });
    });
  });

  it("ignores unrelated state events", () => {
    withTestScheduler(({ expectObservable, schedule }) => {
      const functional$ = createFunctionalMembers$(scope, room);
      schedule("-a", { a: () => emitStateEvent("m.room.topic") });
      expectObservable(functional$).toBe("a", { a: new Set() });
    });
  });

  it("drops entries that are not user IDs", () => {
    withTestScheduler(({ expectObservable }) => {
      serviceMembers = ["@bot:example.com", 42 as unknown as string];
      expectObservable(createFunctionalMembers$(scope, room)).toBe("a", {
        a: new Set(["@bot:example.com"]),
      });
    });
  });
});
