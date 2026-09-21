/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Full integration against the dev backend (`pnpm backend`: Synapse develop,
 * lk-jwt-service and LiveKit behind nginx with the dev TLS certificate)
 * through the js-sdk drivers: two real users in one encrypted room, two
 * participations, and every wire feature the crate relies on — transport
 * discovery, the slot state event, sticky member events, delayed events and
 * their delegation, the token exchange, Olm-encrypted media keys and
 * homeserver connectivity.
 *
 * Opt-in, because it needs the backend and takes a minute:
 *
 *   MATRIX_RTC_BACKEND=1 NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *     pnpm vitest run --project unit src/state/rtc/RtcParticipationManager.backend.test.ts
 *
 * `HOMESERVER_URL` overrides the homeserver (default: the dev backend).
 */

// The global `process` is vite-plugin-node-polyfills' browser shim, whose
// `env` is empty; the real one comes from the module.
import { env } from "node:process";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ClientEvent,
  createClient,
  type MatrixClient,
  Method,
  Preset,
  type Room,
  SyncState,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { MatrixRTCMode } from "../../config/ConfigOptions";
import { JsSdkElementCallMatrixClientDriver } from "../../driver/jsSdk/JsSdkElementCallMatrixClientDriver";
import { JsSdkRtcMatrixDriver } from "../../driver/jsSdk/JsSdkRtcMatrixDriver";
import { waitFor } from "../../driver/MockRtcMatrixDriver";
import {
  FfiDelegationRoute,
  FfiImpairment,
  FfiKeepAlive,
  FfiStatus,
} from "../../matrix-rtc-sdk";
import { initMatrixRtcSdkForTests } from "../../utils/test-matrix-rtc";
import { testScope } from "../../utils/test";
import { RtcParticipationManager } from "./RtcParticipationManager";
import { joinParamsFromConfig, participationConfig } from "./joinParams";
import { ELEMENT_CALL_SLOT_EVENT_TYPE, ELEMENT_CALL_SLOT_ID } from "./slot";
import { publishOnLivekit } from "./transportIntent";

const enabled = env.MATRIX_RTC_BACKEND === "1";
const HOMESERVER_URL = (
  env.HOMESERVER_URL ?? "https://synapse.m.localhost"
).replace(/\/$/, "");
/** The transport `backend/dev_homeserver.yaml` advertises. */
const DEV_LIVEKIT_SERVICE_URL = "https://matrix-rtc.m.localhost/livekit/jwt";
const DELAYED_EVENTS_PREFIX = "/_matrix/client/unstable/org.matrix.msc4140";

const session = {
  delayed_leave: { delay_ms: 18_000 },
  delegated_delayed_leave: { delay_ms: 3_600_000 },
  network_error_retry_ms: 1000,
  wait_for_key_rotation_ms: 50,
};

interface TestUser {
  name: string;
  client: MatrixClient;
  room: Room;
  userId: string;
  deviceId: string;
  rtcDriver: JsSdkRtcMatrixDriver;
  clientDriver: JsSdkElementCallMatrixClientDriver;
  stop: () => void;
}

interface DelayedEvent {
  delay_id: string;
  room_id: string;
  type: string;
  state_key?: string;
  delay: number;
  running_since: number;
  content: Record<string, unknown>;
}

const log = (who: string, line: string): void =>
  // Progress of an opt-in integration run, meant to be read.
  // eslint-disable-next-line no-console
  console.log(`[backend ${who}] ${line}`);

/**
 * Register a throwaway user, boot rust crypto, sync, and be in the room.
 * `legacyMembers` gives every member the power to send the MSC3401 member
 * *state* event, as Element Call's own rooms do (`state_default: 0`); a
 * plain room keeps the default 50, which also keeps Bob from opening a slot.
 */
async function createUser(
  name: string,
  roomId?: string,
  { encrypted = true, legacyMembers = false } = {},
): Promise<TestUser> {
  const localpart = `ec-${name.toLowerCase()}-${Date.now().toString(16)}${Math.floor(
    Math.random() * 0xffff,
  ).toString(16)}`;
  const register = async (): Promise<Response> =>
    fetch(`${HOMESERVER_URL}/_matrix/client/v3/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: localpart,
        password: `test-${localpart}`,
        auth: { type: "m.login.dummy" },
      }),
    });
  let response = await register();
  // Synapse rate-limits registrations; the second case of this file runs
  // straight into that.
  while (response.status === 429) {
    const { retry_after_ms: retryAfterMs = 1000 } = (await response.json()) as {
      retry_after_ms?: number;
    };
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs + 100));
    response = await register();
  }
  if (!response.ok)
    throw new Error(
      `registration failed: ${response.status} ${await response.text()}`,
    );
  const {
    user_id: userId,
    device_id: deviceId,
    access_token: accessToken,
  } = (await response.json()) as {
    user_id: string;
    device_id: string;
    access_token: string;
  };
  const client = createClient({
    baseUrl: HOMESERVER_URL,
    accessToken,
    userId,
    deviceId,
    logger: logger.getChild(`[${name}]`),
  });
  // In memory on purpose: every run is a fresh device.
  await client.initRustCrypto({ useIndexedDB: false });
  await client.setDisplayName(name);
  void client.startClient();
  await new Promise<void>((resolve, reject) => {
    client.once(ClientEvent.Sync, (state) =>
      state === SyncState.Prepared
        ? resolve()
        : reject(new Error(`sync failed: ${state}`)),
    );
  });

  if (roomId === undefined) {
    const created = await client.createRoom({
      preset: Preset.PublicChat,
      name: `Element Call backend check ${new Date().toISOString()}`,
      power_level_content_override: legacyMembers
        ? { events: { "org.matrix.msc3401.call.member": 0 } }
        : undefined,
      initial_state: encrypted
        ? [
            {
              type: "m.room.encryption",
              state_key: "",
              content: { algorithm: "m.megolm.v1.aes-sha2" },
            },
          ]
        : [],
    });
    roomId = created.room_id;
  } else {
    await client.joinRoom(roomId);
  }
  await waitFor(
    `${name}'s room to appear in sync`,
    () => client.getRoom(roomId) !== null,
    10_000,
  );
  const room = client.getRoom(roomId)!;
  log(name, `ready as ${userId} (${deviceId}) in ${roomId}`);

  const rtcDriver = new JsSdkRtcMatrixDriver(client, room);
  const clientDriver = new JsSdkElementCallMatrixClientDriver(client, room);
  return {
    name,
    client,
    room,
    userId,
    deviceId,
    rtcDriver,
    clientDriver,
    stop: () => {
      rtcDriver.detach();
      client.stopClient();
    },
  };
}

function participate(
  user: TestUser,
  mode: MatrixRTCMode,
  manageMediaKeys: boolean,
): RtcParticipationManager {
  return new RtcParticipationManager(
    testScope(),
    user.rtcDriver,
    user.room.roomId,
    user.userId,
    user.deviceId,
    {
      config: participationConfig({ mode, manageMediaKeys, session }),
      logger: logger.getChild(`[${user.name}]`),
    },
  );
}

async function listDelayedEvents(
  client: MatrixClient,
): Promise<DelayedEvent[]> {
  const response = await client.http.authedRequest<{
    delayed_events: DelayedEvent[];
  }>(Method.Get, "/delayed_events", undefined, undefined, {
    prefix: DELAYED_EVENTS_PREFIX,
  });
  return response.delayed_events;
}

async function fetchRawEvent(
  client: MatrixClient,
  roomId: string,
  eventId: string,
): Promise<Record<string, unknown>> {
  return (await client.fetchRoomEvent(roomId, eventId)) as unknown as Record<
    string,
    unknown
  >;
}

function connected(
  rtcParticipationManager: RtcParticipationManager,
): InstanceType<typeof FfiStatus.Connected>["inner"] {
  const status = rtcParticipationManager.status$.value;
  if (!FfiStatus.Connected.instanceOf(status))
    throw new Error(`Expected Connected, got ${status.tag}`);
  return status.inner;
}

describe.skipIf(!enabled)(
  "RtcParticipationManager against the dev backend",
  () => {
    beforeAll(async () => {
      // The two clients' crypto debug output would drown everything else.
      (logger as unknown as { setLevel(level: string): void }).setLevel("warn");
      await initMatrixRtcSdkForTests();
    });

    it.each([
      {
        mode: MatrixRTCMode.Matrix_2_0,
        memberEventType: "org.matrix.msc4143.rtc.member",
        sticky: true,
      },
      {
        mode: MatrixRTCMode.Compatibility,
        memberEventType: "org.matrix.msc3401.call.member",
        sticky: false,
      },
    ])(
      "two users call each other in $mode mode",
      async ({ mode, memberEventType, sticky }) => {
        const alice = await createUser("Alice", undefined, {
          legacyMembers: !sticky,
        });
        const bob = await createUser("Bob", alice.room.roomId);
        const roomId = alice.room.roomId;
        const a = participate(alice, mode, true);
        const b = participate(bob, mode, true);
        const joinParams = joinParamsFromConfig({
          session,
          delegateDelayedLeave: true,
        });
        const dump = (): void => {
          log("alice", `snapshot: ${a.debugSnapshot()}`);
          log("bob", `snapshot: ${b.debugSnapshot()}`);
        };
        try {
          // --- connectivity, before anything else ------------------------------
          expect(alice.rtcDriver.isHomeserverConnected()).toBe(true);

          // --- the slot ----------------------------------------------------------
          // A fresh room has no slot. Alice created it, so she may open one; Bob
          // (power level 0, state_default 50) may not.
          await waitFor("the seed", () => a.session$.value.seeded, 15_000);
          expect(a.session$.value.slotOpen).not.toBe(true);
          expect(
            alice.room.currentState.getStateEvents(
              ELEMENT_CALL_SLOT_EVENT_TYPE,
            ),
          ).toEqual([]);
          const aliceRoom = alice.clientDriver.getRoomInfo();
          const bobRoom = bob.clientDriver.getRoomInfo();
          expect(aliceRoom.encrypted).toBe(true);
          expect(aliceRoom.canOpenSlot).toBe(true);
          expect(bobRoom.canOpenSlot).toBe(false);

          // --- Alice joins: opens the slot, discovers the transport, publishes --
          await a.join(publishOnLivekit(), joinParams, {
            encrypted: aliceRoom.encrypted,
            canOpen: aliceRoom.canOpenSlot,
          });
          const aliceStatus = connected(a);
          log("alice", `joined: keepAlive=${aliceStatus.keepAlive.tag}`);

          const slot = alice.room.currentState.getStateEvents(
            ELEMENT_CALL_SLOT_EVENT_TYPE,
            ELEMENT_CALL_SLOT_ID,
          );
          if (sticky) {
            expect(slot?.getContent()).toMatchObject({
              status: "open",
              application: { type: "m.call" },
              encryption: { type: "m.per_member" },
            });
            await waitFor(
              "bob to see the slot",
              () => b.session$.value.slotOpen === true,
              15_000,
            );
          } else {
            // The pre-slot generation: nothing opened, nothing to wait for.
            expect(slot).toBeNull();
          }

          // The transport came from the homeserver's /rtc/transports.
          const [connection] = a.connections$.value;
          expect(connection.connection.serviceUrl).toBe(
            DEV_LIVEKIT_SERVICE_URL,
          );
          expect(connection.connection.jwtToken.split(".")).toHaveLength(3);
          expect(connection.connection.wsUrl).toMatch(/^wss:\/\//);

          // --- the member event on the wire -------------------------------------
          await waitFor(
            "alice to see her own membership",
            () => a.ownMembership$.value !== null,
            15_000,
          );
          const ownEventId = a.ownMembership$.value!.member.eventId;
          expect(ownEventId).toBeDefined();
          const raw = await fetchRawEvent(alice.client, roomId, ownEventId!);
          log("alice", `own member event: ${JSON.stringify(raw)}`);
          if (sticky) {
            // A sticky event is a timeline event: in an encrypted room matrix-js-sdk
            // Megolm-encrypts it like any other (its own MatrixRTC code decrypts
            // them on the way in, as our driver does). The sticky marker is in
            // the clear.
            expect(raw.type).toBe("m.room.encrypted");
            expect(raw.state_key).toBeUndefined();
            expect(raw).toHaveProperty("msc4354_sticky");
            const decrypted = [...alice.room._unstable_getStickyEvents()].find(
              (e) => e.getId() === ownEventId,
            );
            expect(decrypted?.getType()).toBe(memberEventType);
          } else {
            expect(raw.type).toBe(memberEventType);
            expect(raw.state_key).toBe(
              `_${alice.userId}_${alice.deviceId}_m.call`,
            );
          }

          // --- delayed events and their delegation -------------------------------
          const delayed = await listDelayedEvents(alice.client);
          log("alice", `delayed events: ${JSON.stringify(delayed)}`);
          expect(delayed).toHaveLength(1);
          expect(delayed[0].room_id).toBe(roomId);
          expect(delayed[0].type).toBe(memberEventType);
          const keepAlive = aliceStatus.keepAlive;
          if (sticky) {
            // The dev Synapse proxies `rtc/livekit/*` to lk-jwt-service
            // (MSC4512), so the homeserver route takes the long leave over.
            expect(FfiKeepAlive.Delegated.instanceOf(keepAlive)).toBe(true);
            expect(
              (keepAlive as InstanceType<typeof FfiKeepAlive.Delegated>).inner
                .via,
            ).toBe(FfiDelegationRoute.Homeserver);
            expect(delayed[0].delay).toBe(
              session.delegated_delayed_leave.delay_ms,
            );
          } else {
            // MSC4195 is not spoken for the pre-slot generation: our own leave.
            expect(FfiKeepAlive.Armed.instanceOf(keepAlive)).toBe(true);
            expect(delayed[0].delay).toBe(session.delayed_leave.delay_ms);
          }

          // --- Bob joins: roster, profiles, one connection with two members -----
          await b.join(publishOnLivekit(), joinParams, {
            encrypted: bobRoom.encrypted,
            canOpen: bobRoom.canOpenSlot,
          });
          connected(b);
          await waitFor(
            "alice to see bob",
            () =>
              a.memberships$.value.value.some(
                (m) => m.member.userId === bob.userId,
              ),
            20_000,
          );
          await waitFor(
            "bob to see alice",
            () =>
              b.memberships$.value.value.some(
                (m) => m.member.userId === alice.userId,
              ),
            20_000,
          );
          const bobSeenByAlice = a.memberships$.value.value.find(
            (m) => m.member.userId === bob.userId,
          )!;
          expect(bobSeenByAlice.member.displayName).toBe("Bob");
          expect(bobSeenByAlice.member.deviceId).toBe(bob.deviceId);
          expect(bobSeenByAlice.connections).toEqual([DEV_LIVEKIT_SERVICE_URL]);
          await waitFor(
            "two members on alice's connection",
            () => a.connections$.value[0]?.members.length === 2,
            20_000,
          );

          // --- media keys, Olm-encrypted to-device both ways ---------------------
          await waitFor(
            "bob to hold alice's key",
            () =>
              b.keyMap$.value.some((k) => k.memberId === a.ownMemberId$.value),
            30_000,
          );
          await waitFor(
            "alice to hold bob's key",
            () =>
              a.keyMap$.value.some((k) => k.memberId === b.ownMemberId$.value),
            30_000,
          );
          await waitFor(
            "alice to know bob holds her key",
            () =>
              a.memberships$.value.value.find(
                (m) => m.member.userId === bob.userId,
              )?.mediaKey?.holdsOurKey === true,
            30_000,
          );
          const bobKeyState = a.memberships$.value.value.find(
            (m) => m.member.userId === bob.userId,
          )!.mediaKey!;
          log("alice", `bob's key state: ${JSON.stringify(bobKeyState)}`);
          expect(bobKeyState.haveTheirKey).toBe(true);
          expect(bobKeyState.rejection).toBeUndefined();
          // MSC4153 verdict travels with the key (C10): nobody here is
          // cross-signed, so the answer is "no", not "unknown".
          expect(bobKeyState.senderCrossSigned).toBe(false);

          // --- Alice leaves: delayed events cancelled, Bob sees her go -----------
          await a.leave("m.user_hangup");
          expect(FfiStatus.Disconnected.instanceOf(a.status$.value)).toBe(true);
          expect(await listDelayedEvents(alice.client)).toEqual([]);
          await waitFor(
            "bob to see alice gone",
            () =>
              !b.memberships$.value.value.some(
                (m) => m.member.userId === alice.userId,
              ),
            20_000,
          );

          // --- losing the homeserver is a critical impairment (C12) -------------
          // Bob's network goes away: every request fails and the long-poll in
          // flight is cut, so matrix-js-sdk's sync loop leaves `Syncing`.
          const { opts } = bob.client.http;
          opts.fetchFn = async () => {
            return Promise.reject(new TypeError("network down"));
          };
          bob.client.http.abort();
          const unreachable = (): boolean =>
            connected(b).impairments.some((i) =>
              FfiImpairment.HomeserverUnreachable.instanceOf(i),
            );
          await waitFor(
            "bob's participation to notice the homeserver is gone",
            unreachable,
            15_000,
          );
          // ...and comes back: the sync loop recovers and the impairment clears.
          delete opts.fetchFn;
          await waitFor(
            "bob's participation to see the homeserver again",
            () => !unreachable(),
            30_000,
          );
          await b.leave();
          expect(FfiStatus.Disconnected.instanceOf(b.status$.value)).toBe(true);
        } catch (e) {
          dump();
          throw e;
        } finally {
          // Leave before the clients stop: a leave needs the homeserver.
          await a.leave();
          await b.leave();
          alice.stop();
          bob.stop();
        }
      },
      180_000,
    );
  },
);
