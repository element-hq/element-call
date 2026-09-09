/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The homeserver of the Playwright backend, as `config.devenv.json` names it. */
export const HOMESERVER_URL = "https://synapse.m.localhost";

/** MSC3417: the room type Element Call gives its calls. */
const CALL_ROOM_TYPE = "org.matrix.msc3417.call";

/** The state event every call participant sends to announce their membership. */
const RTC_MEMBER_EVENT_TYPE = "org.matrix.msc3401.call.member";

async function csApiRequest(
  accessToken: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return await fetch(`${HOMESERVER_URL}/_matrix/client/v3/${path}`, init);
}

async function csApi<T>(
  accessToken: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await csApiRequest(accessToken, method, path, body);
  if (!response.ok)
    throw new Error(
      `${method} ${path} failed: ${response.status} ${await response.text()}`,
    );
  return (await response.json()) as T;
}

/**
 * Create a room that Element Call sees as a call, and that anyone who gets in
 * may participate in. The creator is its only moderator, and `joinRule` is
 * written as `m.room.join_rules` over whatever the preset would set.
 *
 * @returns The room's ID
 */
export async function createCallRoom({
  accessToken,
  name,
  joinRule,
}: {
  accessToken: string;
  name: string;
  joinRule: string;
}): Promise<string> {
  const created = await csApi<{ room_id: string }>(
    accessToken,
    "POST",
    "createRoom",
    {
      name,
      preset: "private_chat",
      creation_content: { type: CALL_ROOM_TYPE },
      initial_state: [
        {
          type: "m.room.join_rules",
          state_key: "",
          content: { join_rule: joinRule },
        },
      ],
      power_level_content_override: {
        events: { [RTC_MEMBER_EVENT_TYPE]: 0 },
      },
    },
  );
  return created.room_id;
}

export async function inviteUser(
  accessToken: string,
  roomId: string,
  userId: string,
): Promise<void> {
  await csApi(
    accessToken,
    "POST",
    `rooms/${encodeURIComponent(roomId)}/invite`,
    {
      user_id: userId,
    },
  );
}

export async function kickUser(
  accessToken: string,
  roomId: string,
  userId: string,
): Promise<void> {
  await csApi(accessToken, "POST", `rooms/${encodeURIComponent(roomId)}/kick`, {
    user_id: userId,
  });
}

export async function banUser(
  accessToken: string,
  roomId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await csApi(accessToken, "POST", `rooms/${encodeURIComponent(roomId)}/ban`, {
    user_id: userId,
    reason,
  });
}

/**
 * Read a user's membership as the server reports it, from the room state, so
 * that knocks and leaves are visible and not just joins.
 *
 * @returns The membership, or undefined while the user has no member event
 */
export async function membershipOf(
  accessToken: string,
  roomId: string,
  userId: string,
): Promise<string | undefined> {
  const response = await csApiRequest(
    accessToken,
    "GET",
    `rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(userId)}`,
  );
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(
      `Reading the membership of ${userId} failed: ${response.status} ${await response.text()}`,
    );
  return ((await response.json()) as { membership: string }).membership;
}
