/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MatrixEvent, RoomEvent, UserEvent } from "matrix-js-sdk";
import { describe, expect, it, vi } from "vitest";

import { JsSdkElementCallMatrixClientDriver } from "./JsSdkElementCallMatrixClientDriver";
import {
  ME,
  ROOM_ID,
  asClient,
  asRoom,
  fakeClient,
  fakeRoom,
} from "./jsSdkTestFakes";

describe("JsSdkElementCallMatrixClientDriver", () => {
  it("serves room info, members, timeline and profile from a full client", async () => {
    const client = fakeClient(false);
    const room = fakeRoom();
    const driver = new JsSdkElementCallMatrixClientDriver(
      asClient(client),
      asRoom(room),
    );
    expect(driver.userId).toBe(ME);
    expect(driver.getRoomInfo()).toEqual({
      name: "Standup",
      canonicalAlias: "#standup:example.org",
      avatarUrl: "mxc://example.org/room",
      joinRule: "public",
      encrypted: true,
      canOpenSlot: true,
    });
    const onInfo = vi.fn();
    const offInfo = driver.subscribeRoomInfo(onInfo);
    room.name = "Retro";
    room.emit(RoomEvent.Name, room);
    expect(onInfo).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Retro" }),
    );
    offInfo();

    expect(driver.getRoomMembers()).toEqual([
      {
        userId: "@a:example.org",
        displayName: "Alice",
        avatarUrl: "mxc://example.org/alice",
        membership: "join",
      },
      {
        userId: "@b:example.org",
        displayName: null,
        avatarUrl: null,
        membership: "invite",
      },
    ]);

    const seen: string[] = [];
    driver.subscribeTimeline((e) => seen.push(`${e.type}:${e.eventId}`));
    const reaction = new MatrixEvent({
      type: "m.reaction",
      sender: "@a:example.org",
      event_id: "$r1",
      room_id: ROOM_ID,
      origin_server_ts: 3,
      content: { "m.relates_to": { rel_type: "m.annotation", key: "🖐️" } },
    });
    client.emit(RoomEvent.Timeline, reaction, room, false, false, {});
    client.emit(RoomEvent.Timeline, reaction, room, false, false, {});
    await vi.waitFor(() => expect(seen).toEqual(["m.reaction:$r1"]));

    await driver.sendRoomEvent("io.element.call.reaction", { emoji: "🎉" });
    expect(client.sendEvent).toHaveBeenCalledWith(
      ROOM_ID,
      "io.element.call.reaction",
      { emoji: "🎉" },
    );
    await driver.redactEvent("$r1");
    expect(client.redactEvent).toHaveBeenCalledWith(ROOM_ID, "$r1");

    expect(driver.getOwnProfile()).toEqual({
      displayName: "Me",
      avatarUrl: "mxc://example.org/me",
    });
    const onProfile = vi.fn();
    driver.subscribeOwnProfile(onProfile);
    const user = client.getUser(ME)!;
    user.rawDisplayName = "Moi";
    user.emit(UserEvent.DisplayName, undefined, user);
    expect(onProfile).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Moi" }),
    );

    await expect(driver.getMatrixClientFeatures()).resolves.toEqual({
      stickyEvents: true,
      verifiedEventOrigins: true,
      crossSigningVerdicts: true,
    });
    await expect(driver.getDiagnostics()).resolves.toMatchObject({
      matrix_backend: "jssdk",
      crypto_version: "fake 1.0",
    });
  });

  it("says what a widget client cannot vouch for and leaves media to the host bridge", async () => {
    const driver = new JsSdkElementCallMatrixClientDriver(
      asClient(fakeClient(true)),
      asRoom(fakeRoom()),
    );
    await expect(driver.getMatrixClientFeatures()).resolves.toMatchObject({
      verifiedEventOrigins: false,
      crossSigningVerdicts: false,
    });
    // no token of its own: media comes through the host bridge instead
    await expect(
      driver.thumbnailUrl("mxc://example.org/x", 96, 96, "crop"),
    ).resolves.toBeNull();
  });
});
