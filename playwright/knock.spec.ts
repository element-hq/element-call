/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect } from "@playwright/test";

import { spaTest as test, type SpaUser } from "./fixtures/spa-user.ts";
import {
  banUser,
  createCallRoom,
  inviteUser,
  kickUser,
  membershipOf,
} from "./utils/matrix-api.ts";

/** The app URL for a call known only by its room ID. */
const callUrl = (roomId: string): string =>
  `/room/#?roomId=${encodeURIComponent(roomId)}`;

/** Reads the membership the server holds for `user`, as a moderator sees it. */
const membershipPoll =
  (moderator: SpaUser, roomId: string, user: SpaUser) =>
  async (): Promise<string | undefined> =>
    await membershipOf(moderator.accessToken, roomId, user.mxId);

test("Ask to join a call, withdraw, ask again and be let in", async ({
  page,
  spaUser,
  registerUser,
}) => {
  test.slow();
  const moderator = await registerUser("moderator");
  const roomId = await createCallRoom({
    accessToken: moderator.accessToken,
    name: "Knock call",
    joinRule: "knock",
  });
  const membership = membershipPoll(moderator, roomId, spaUser);

  await page.goto(callUrl(roomId));

  const joinButton = page.getByTestId("lobby_joinCall");
  await expect(joinButton).toHaveText("Request to join call");
  await expect(joinButton).toBeEnabled();
  await expect(page.locator("video")).toBeVisible();

  await joinButton.click();

  await expect(joinButton).toHaveText("Request to join sent");
  await expect(joinButton).toBeDisabled();
  await expect(page.getByTestId("lobby_joinMessage")).toContainText(
    "You will receive an invite to join the call if your request is accepted.",
  );
  await expect.poll(membership).toBe("knock");

  await page.getByTestId("lobby_cancelRequest").click();

  await expect(joinButton).toHaveText("Request to join call");
  await expect(joinButton).toBeEnabled();
  await expect(page.getByTestId("lobby_joinMessage")).toBeHidden();
  await expect.poll(membership).toBe("leave");

  await joinButton.click();

  await expect(joinButton).toHaveText("Request to join sent");
  await expect.poll(membership).toBe("knock");

  await inviteUser(moderator.accessToken, roomId, spaUser.mxId);

  // The accepted request joins the room and skips a second lobby.
  await expect(page.getByTestId("incall_leave")).toBeVisible({
    timeout: 60_000,
  });
  await expect(joinButton).toBeHidden();
});

test("A declined request is shown in the lobby", async ({
  page,
  spaUser,
  registerUser,
}) => {
  const moderator = await registerUser("moderator");
  const roomId = await createCallRoom({
    accessToken: moderator.accessToken,
    name: "Declining call",
    joinRule: "knock",
  });

  await page.goto(callUrl(roomId));
  await page.getByTestId("lobby_joinCall").click();
  await expect.poll(membershipPoll(moderator, roomId, spaUser)).toBe("knock");

  await kickUser(moderator.accessToken, roomId, spaUser.mxId);

  const message = page.getByTestId("lobby_joinMessage");
  await expect(message).toContainText("Access denied");
  await expect(message).toContainText("Your request to join was declined.");
  await expect(page.getByTestId("lobby_joinCall")).toBeHidden();
  // The camera preview outlives the refusal.
  await expect(page.locator("video")).toBeVisible();
});

test("A ban is shown in the lobby, with its reason", async ({
  page,
  spaUser,
  registerUser,
}) => {
  const moderator = await registerUser("moderator");
  const roomId = await createCallRoom({
    accessToken: moderator.accessToken,
    name: "Banning call",
    joinRule: "knock",
  });

  await page.goto(callUrl(roomId));
  await page.getByTestId("lobby_joinCall").click();
  await expect.poll(membershipPoll(moderator, roomId, spaUser)).toBe("knock");

  await banUser(moderator.accessToken, roomId, spaUser.mxId, "Wrong call");

  const message = page.getByTestId("lobby_joinMessage");
  await expect(message).toContainText("Banned");
  await expect(message).toContainText("You have been banned from the room.");
  await expect(message).toContainText("Reason: Wrong call");
  await expect(page.getByTestId("lobby_joinCall")).toBeHidden();
});

test("A call that takes no requests says so in the lobby", async ({
  page,
  spaUser,
  registerUser,
}) => {
  const moderator = await registerUser("moderator");
  // Synapse serves an MSC3266 summary for knock and knock_restricted rooms
  // only, so a `knock_restricted` room, whose rule Element Call cannot act on
  // without knowing the user's other rooms, is the one shape that reaches the
  // lobby with nothing to offer.
  const roomId = await createCallRoom({
    accessToken: moderator.accessToken,
    name: "Space call",
    joinRule: "knock_restricted",
  });

  await page.goto(callUrl(roomId));

  await expect(page.getByTestId("lobby_joinMessage")).toContainText(
    "You need an invite to join this call.",
  );
  await expect(page.getByTestId("lobby_joinCall")).toBeHidden();
  await expect(page.locator("video")).toBeVisible();
});

test("An invite-only call cannot be reached at all", async ({
  page,
  spaUser,
  registerUser,
}) => {
  const moderator = await registerUser("moderator");
  const roomId = await createCallRoom({
    accessToken: moderator.accessToken,
    name: "Private call",
    joinRule: "invite",
  });

  await page.goto(callUrl(roomId));

  // Synapse serves no room summary for an invite-only room, so Element Call
  // falls back to joining as if the room were public and the refusal lands on
  // the error page rather than in the lobby.
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeHidden();
});
