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

import { useState, useEffect, useRef, useCallback } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { EventType } from "matrix-js-sdk/src/@types/event";
import {
  ClientEvent,
  MatrixClient,
  RoomSummary,
} from "matrix-js-sdk/src/client";
import { SyncState } from "matrix-js-sdk/src/sync";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { RoomEvent, Room } from "matrix-js-sdk/src/models/room";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { JoinRule } from "matrix-js-sdk";
import { useTranslation } from "react-i18next";

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

export type GroupCallCanKnock = {
  kind: "canKnock";
  roomSummary: RoomSummary;
  knock: () => void;
};

export type GroupCallStatus =
  | GroupCallLoaded
  | GroupCallLoadFailed
  | GroupCallLoading
  | GroupCallWaitForInvite
  | GroupCallCanKnock;

export class CallTerminatedMessage extends Error {
  /**
   * @param messageBody The message explaining the kind of termination (kick, ban, knock reject, etc.) (translated)
   */
  public messageBody: string;
  /**
   * @param reason The user provided reason for the termination (kick/ban)
   */
  public reason?: string;
  /**
   *
   * @param messageTitle The title of the call ended screen message (translated)
   * @param messageBody The message explaining the kind of termination (kick, ban, knock reject, etc.) (translated)
   * @param reason The user provided reason for the termination (kick/ban)
   */
  public constructor(
    messageTitle: string,
    messageBody: string,
    reason?: string,
  ) {
    super(messageTitle);
    this.messageBody = messageBody;
    this.reason = reason;
  }
}

export const useLoadGroupCall = (
  client: MatrixClient,
  roomIdOrAlias: string,
  viaServers: string[],
): GroupCallStatus => {
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });
  const activeRoom = useRef<Room>();
  const { t } = useTranslation();

  const bannedError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        t("group_call_loader.banned_heading"),
        t("group_call_loader.banned_body"),
        leaveReason(),
      ),
    [t],
  );
  const knockRejectError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        t("group_call_loader.knock_reject_heading"),
        t("group_call_loader.knock_reject_body"),
        leaveReason(),
      ),
    [t],
  );
  const removeNoticeError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        t("group_call_loader.call_ended_heading"),
        t("group_call_loader.call_ended_body"),
        leaveReason(),
      ),
    [t],
  );

  const leaveReason = (): string =>
    activeRoom.current?.currentState
      .getStateEvents(EventType.RoomMember, activeRoom.current?.myUserId)
      ?.getContent().reason;

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
      onKnockSent: () => void,
    ): Promise<Room> => {
      let joinedRoom: Room | null = null;
      await client.knockRoom(roomId, { viaServers });
      onKnockSent();
      const invitePromise = new Promise<void>((resolve, reject) => {
        client.on(
          RoomEvent.MyMembership,
          async (room, membership, prevMembership) => {
            if (roomId !== room.roomId) return;
            activeRoom.current = room;
            if (membership === KnownMembership.Invite) {
              await client.joinRoom(room.roomId, { viaServers });
              joinedRoom = room;
              logger.log("Auto-joined %s", room.roomId);
              resolve();
            }
            if (membership === KnownMembership.Ban) reject(bannedError());
            if (membership === KnownMembership.Leave)
              reject(knockRejectError());
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
        activeRoom.current = room;
      } else {
        // The call uses a room_id
        const roomId = roomIdOrAlias;

        // first try if the room already exists
        //  - in widget mode
        //  - in SPA mode if the user already joined the room
        room = client.getRoom(roomId);
        activeRoom.current = room ?? undefined;
        const membership = room?.getMyMembership();
        if (membership === KnownMembership.Join) {
          // room already joined so we are done here already.
          return room!;
        }
        if (widget)
          // in widget mode we never should reach this point. (getRoom should return the room.)
          throw new Error(
            "Room not found. The widget-api did not pass over the relevant room events/information.",
          );

        // If the room does not exist we first search for it with viaServers
        const roomSummary = await client.getRoomSummary(roomId, viaServers);
        if (membership === KnownMembership.Ban) {
          throw bannedError();
        } else if (membership === KnownMembership.Invite) {
          room = await client.joinRoom(roomId, {
            viaServers,
          });
        } else {
          if (roomSummary.join_rule === JoinRule.Public) {
            room = await client.joinRoom(roomSummary.room_id, {
              viaServers,
            });
          } else if (roomSummary.join_rule === JoinRule.Knock) {
            let knock: () => void = () => {};
            const userPressedAskToJoinPromise: Promise<void> = new Promise(
              (resolve) => {
                if (roomSummary.membership !== KnownMembership.Knock) {
                  knock = resolve;
                } else {
                  // resolve immediately if the user already knocked
                  resolve();
                }
              },
            );
            setState({ kind: "canKnock", roomSummary, knock });
            await userPressedAskToJoinPromise;
            room = await getRoomByKnocking(
              roomSummary.room_id,
              viaServers,
              () => setState({ kind: "waitForInvite", roomSummary }),
            );
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
      activeRoom.current = room;
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

    const observeMyMembership = async (): Promise<void> => {
      await new Promise((_, reject) => {
        client.on(RoomEvent.MyMembership, async (_, membership) => {
          if (membership === KnownMembership.Leave) reject(removeNoticeError());
          if (membership === KnownMembership.Ban) reject(bannedError());
        });
      });
    };

    if (state.kind === "loading") {
      logger.log("Start loading group call");
      waitForClientSyncing()
        .then(fetchOrCreateGroupCall)
        .then((rtcSession) => setState({ kind: "loaded", rtcSession }))
        .then(observeMyMembership)
        .catch((error) => setState({ kind: "failed", error }));
    }
  }, [
    bannedError,
    client,
    knockRejectError,
    removeNoticeError,
    roomIdOrAlias,
    state,
    t,
    viaServers,
  ]);

  return state;
};
