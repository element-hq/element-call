/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import { MockElementCallMatrixClientDriver } from "./MockElementCallMatrixClientDriver";
import { MOCK_ROOM_ID } from "./MockRtcMatrixDriver";

describe("MockElementCallMatrixClientDriver", () => {
  it("notifies room info, member and profile subscribers until unsubscribed", () => {
    const driver = new MockElementCallMatrixClientDriver({
      roomInfo: { name: "Standup" },
    });
    expect(driver.getRoomInfo().name).toBe("Standup");
    const onInfo = vi.fn();
    const off = driver.subscribeRoomInfo(onInfo);
    driver.setRoomInfo({ name: "Retro" });
    expect(onInfo).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Retro" }),
    );
    off();
    driver.setRoomInfo({ name: "Planning" });
    expect(onInfo).toHaveBeenCalledTimes(1);

    const onMembers = vi.fn();
    driver.subscribeRoomMembers(onMembers);
    const alice = {
      userId: "@alice:example.org",
      displayName: "Alice",
      avatarUrl: null,
      membership: "join" as const,
    };
    driver.setRoomMembers([alice]);
    expect(onMembers).toHaveBeenCalledWith([alice]);
    expect(driver.getRoomMembers()).toEqual([alice]);

    const onProfile = vi.fn();
    driver.subscribeOwnProfile(onProfile);
    driver.setOwnProfile({ displayName: "Bob" });
    expect(onProfile).toHaveBeenCalledWith({
      displayName: "Bob",
      avatarUrl: null,
    });
  });

  it("records sent room events, echoes them, and resolves relations", async () => {
    const driver = new MockElementCallMatrixClientDriver();
    const seen: string[] = [];
    driver.subscribeTimeline((e) => seen.push(e.type));
    const { eventId } = await driver.sendRoomEvent("m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: "$membership",
        key: "🖐️",
      },
    });
    expect(driver.calls("sendRoomEvent")[0]).toMatchObject({
      eventType: "m.reaction",
      eventId,
    });
    expect(seen).toEqual(["m.reaction"]);
    expect(
      driver.getRelatedEvents("$membership", "m.annotation", "m.reaction"),
    ).toHaveLength(1);
    await driver.redactEvent(eventId);
    expect(seen).toEqual(["m.reaction", "m.room.redaction"]);
    expect(
      driver.getRelatedEvents("$membership", "m.annotation", "m.reaction"),
    ).toHaveLength(0);
  });

  it("answers thumbnails for mxc urls only", async () => {
    const driver = new MockElementCallMatrixClientDriver();
    await expect(
      driver.thumbnailUrl("mxc://example.org/abc", 96, 96, "crop"),
    ).resolves.toContain("abc");
    await expect(
      driver.thumbnailUrl("https://not-mxc", 96, 96, "crop"),
    ).resolves.toBeNull();
    expect(driver.roomId).toBe(MOCK_ROOM_ID);
    await expect(driver.getMatrixClientFeatures()).resolves.toMatchObject({
      stickyEvents: true,
    });
  });
});
