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

import { useState, useEffect } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { ClientEvent, MatrixClient } from "matrix-js-sdk/src/client";
import { SyncState } from "matrix-js-sdk/src/sync";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { RoomEvent, type Room } from "matrix-js-sdk/src/models/room";
import { KnownMembership, Membership, RoomType } from "matrix-js-sdk/src/types";
import { JoinRule } from "matrix-js-sdk";
import { useTranslation } from "react-i18next";

import type { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { widget } from "../widget";

export type GroupCallLoaded = {
  kind: "loaded";
  rtcSession: MatrixRTCSession;
};

export type GroupCallLoadFailed = {
  kind: "failed";
  error: Error;
};

export type GroupCallLoading = {
  kind: "loading";
};

export type GroupCallWaitForInvite = {
  kind: "waitForInvite";
  roomSummary: RoomSummary;
};

export type GroupCallStatus =
  | GroupCallLoaded
  | GroupCallLoadFailed
  | GroupCallLoading
  | GroupCallWaitForInvite;
export interface GroupCallLoadState {
  error?: Error | KnockRejectError;
  groupCall?: GroupCall;
}

export class KnockRejectError extends Error {}
export class BannedError extends Error {}

// RoomSummary from the js-sdk (this is not public so we copy it here)
export interface RoomSummary {
  room_id: string;
  name?: string;
  avatar_url?: string;
  topic?: string;
  canonical_alias?: string;
  aliases?: string[];
  world_readable: boolean;
  guest_can_join: boolean;
  num_joined_members: number;
  join_rule?: JoinRule.Knock | JoinRule.Public; // Added by MSC2403
  room_type?: RoomType;
  membership?: Membership;
  is_encrypted: boolean;
}

export const useLoadGroupCall = (
  client: MatrixClient,
  roomIdOrAlias: string,
  viaServers: string[],
): GroupCallStatus => {
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });
  const { t } = useTranslation();

  useEffect(() => {
    const getRoomByAlias = async (alias: string): Promise<Room> => {
      // We lowercase the localpart when we create the room, so we must lowercase
      // it here too (we just do the whole alias). We can't do the same to room IDs
      // though.
      // Also, we explicitly look up the room alias here. We previously just tried to
      // join anyway but the js-sdk recreates the room if you pass the alias for a
      // room you're already joined to (which it probably ought not to).
      let room: Room | null = null;
      const lookupResult = await client.getRoomIdForAlias(alias.toLowerCase());
      logger.info(`${alias} resolved to ${lookupResult.room_id}`);
      room = client.getRoom(lookupResult.room_id);
      if (!room) {
        logger.info(`Room ${lookupResult.room_id} not found, joining.`);
        room = await client.joinRoom(lookupResult.room_id, {
          viaServers: lookupResult.servers,
        });
      } else {
        logger.info(`Already in room ${lookupResult.room_id}, not rejoining.`);
      }
      return room;
    };

    const getRoomByKnocking = async (
      roomId: string,
      viaServers: string[],
    ): Promise<Room> => {
      let joinedRoom: Room | null = null;
      await client.knockRoom(roomId);

      const invitePromise = new Promise<void>((resolve, reject) => {
        client.on(
          RoomEvent.MyMembership,
          async (room, membership, prevMembership) => {
            if (membership === KnownMembership.Invite) {
              await client.joinRoom(room.roomId, { viaServers });
              joinedRoom = room;
              logger.log("Auto-joined %s", room.roomId);
              resolve();
            }
            if (
              membership === KnownMembership.Ban ||
              membership === KnownMembership.Leave
            ) {
              // also resolve in case of rejection
              // we will check if joining worked in the next step
              reject(
                new KnockRejectError(t("group_call_loader_reject_message")),
              );
            }
          },
        );
      });
      await invitePromise;
      if (!joinedRoom) {
        throw new Error("Failed to join room after knocking.");
      }
      return joinedRoom;
    };

    const fetchOrCreateRoom = async (): Promise<Room> => {
      let room: Room | null = null;
      if (roomIdOrAlias[0] === "#") {
        const alias = roomIdOrAlias;
        // The call uses a room alias
        room = await getRoomByAlias(alias);
      } else {
        // The call uses a room_id
        const roomId = roomIdOrAlias;

        // first try if the room already exists
        //  - in widget mode
        //  - in SPA mode if the user already joined the room
        room = client.getRoom(roomId);
        if (room?.getMyMembership() === KnownMembership.Join) {
          // room already joined so we are done here already.
          return room!;
        }
        if (widget)
          // in widget mode we never should reach this point. (getRoom should return the room.)
          throw new Error(
            "Room not found. The widget-api did not pass over the relevant room events/information.",
          );

        // if the room does not exist we first search for it with viaServers
        const roomSummary = await client.getRoomSummary(roomId, viaServers);
        if (room?.getMyMembership() === KnownMembership.Ban) {
          throw new BannedError();
        } else {
          if (roomSummary.join_rule === JoinRule.Public) {
            room = await client.joinRoom(roomSummary.room_id, {
              viaServers,
            });
          } else if (roomSummary.join_rule === JoinRule.Knock) {
            setState({ kind: "waitForInvite", roomSummary });
            room = await getRoomByKnocking(roomSummary.room_id, viaServers);
          } else {
            throw new Error(
              `Room ${roomSummary.room_id} is not joinable. This likely means, that the conference owner has changed the room settings to private.`,
            );
          }
        }
      }

      logger.info(
        `Joined ${roomIdOrAlias}, waiting room to be ready for group calls`,
      );
      await client.waitUntilRoomReadyForGroupCalls(room.roomId);
      logger.info(`${roomIdOrAlias}, is ready for group calls`);
      return room;
    };

    const fetchOrCreateGroupCall = async (): Promise<MatrixRTCSession> => {
      const room = await fetchOrCreateRoom();
      logger.debug(`Fetched / joined room ${roomIdOrAlias}`);

      const rtcSession = client.matrixRTC.getRoomSession(room);
      return rtcSession;
    };

    const waitForClientSyncing = async (): Promise<void> => {
      if (client.getSyncState() !== SyncState.Syncing) {
        logger.debug(
          "useLoadGroupCall: waiting for client to start syncing...",
        );
        await new Promise<void>((resolve) => {
          const onSync = (): void => {
            if (client.getSyncState() === SyncState.Syncing) {
              client.off(ClientEvent.Sync, onSync);
              return resolve();
            }
          };
          client.on(ClientEvent.Sync, onSync);
        });
        logger.debug("useLoadGroupCall: client is now syncing.");
      }
    };

    if (state.kind === "loading") {
      logger.log("Start loading group call");
      waitForClientSyncing()
        .then(fetchOrCreateGroupCall)
        .then((rtcSession) => setState({ kind: "loaded", rtcSession }))
        .catch((error) => setState({ kind: "failed", error }));
    }
  }, [client, roomIdOrAlias, state, t, viaServers]);

  // state === undefined is used to make sure we only run the effect once. But outside the hook it is equivalent to "loading".
  return state;
};
