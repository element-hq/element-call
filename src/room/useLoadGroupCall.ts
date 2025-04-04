/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ComponentType,
  type SVGAttributes,
} from "react";
import {
  JoinRule,
  EventType,
  SyncState,
  MatrixError,
  KnownMembership,
  ClientEvent,
  type MatrixClient,
  type RoomSummary,
  RoomEvent,
  type Room,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { useTranslation } from "react-i18next";
import {
  AdminIcon,
  CloseIcon,
  EndCallIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

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

const MAX_ATTEMPTS_FOR_INVITE_JOIN_FAILURE = 3;
const DELAY_MS_FOR_INVITE_JOIN_FAILURE = 3000;

/**
 * Join a room, and retry on M_FORBIDDEN error in order to work
 * around a potential race when joining rooms over federation.
 *
 * Will wait up to to `DELAY_MS_FOR_INVITE_JOIN_FAILURE` per attempt.
 * Will try up to `MAX_ATTEMPTS_FOR_INVITE_JOIN_FAILURE` times.
 *
 * @see https://github.com/element-hq/element-call/issues/2634
 * @param client The matrix client
 * @param attempt Number of attempts made.
 * @param params Parameters to pass to client.joinRoom
 */
async function joinRoomAfterInvite(
  client: MatrixClient,
  attempt = 0,
  ...params: Parameters<MatrixClient["joinRoom"]>
): ReturnType<MatrixClient["joinRoom"]> {
  try {
    return await client.joinRoom(...params);
  } catch (ex) {
    if (
      ex instanceof MatrixError &&
      ex.errcode === "M_FORBIDDEN" &&
      attempt < MAX_ATTEMPTS_FOR_INVITE_JOIN_FAILURE
    ) {
      // If we were invited and got a M_FORBIDDEN, it's highly likely the server hasn't caught up yet.
      await new Promise((r) => setTimeout(r, DELAY_MS_FOR_INVITE_JOIN_FAILURE));
      return joinRoomAfterInvite(client, attempt + 1, ...params);
    }
    throw ex;
  }
}

export class CallTerminatedMessage extends Error {
  /**
   * @param messageTitle The title of the call ended screen message (translated)
   */
  public constructor(
    /**
     * The icon to display with the message.
     */
    public readonly icon: ComponentType<SVGAttributes<SVGElement>>,
    messageTitle: string,
    /**
     * The message explaining the kind of termination (kick, ban, knock reject,
     * etc.) (translated)
     */
    public readonly messageBody: string,
    /**
     * The user-provided reason for the termination (kick/ban)
     */
    public readonly reason?: string,
  ) {
    super(messageTitle);
  }
}

export const useLoadGroupCall = (
  client: MatrixClient | undefined,
  roomIdOrAlias: string | null,
  viaServers: string[],
): GroupCallStatus => {
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });
  const activeRoom = useRef<Room | undefined>(undefined);
  const { t } = useTranslation();

  const bannedError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        AdminIcon,
        t("group_call_loader.banned_heading"),
        t("group_call_loader.banned_body"),
        leaveReason(),
      ),
    [t],
  );
  const knockRejectError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        CloseIcon,
        t("group_call_loader.knock_reject_heading"),
        t("group_call_loader.knock_reject_body"),
        leaveReason(),
      ),
    [t],
  );
  const removeNoticeError = useCallback(
    (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        EndCallIcon,
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
    if (!client || !roomIdOrAlias) {
      return;
    }
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
      await client.knockRoom(roomId, { viaServers });
      onKnockSent();
      return await new Promise<Room>((resolve, reject) => {
        client.on(
          RoomEvent.MyMembership,
          (room, membership, prevMembership): void => {
            if (roomId !== room.roomId) return;
            activeRoom.current = room;
            if (
              membership === KnownMembership.Invite &&
              prevMembership === KnownMembership.Knock
            ) {
              joinRoomAfterInvite(client, 0, room.roomId, { viaServers }).then(
                (room) => {
                  logger.log("Auto-joined %s", room.roomId);
                  resolve(room);
                },
                reject,
              );
            }
            if (membership === KnownMembership.Ban) reject(bannedError());
            if (membership === KnownMembership.Leave)
              reject(knockRejectError());
          },
        );
      });
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

        if (membership === KnownMembership.Ban) {
          throw bannedError();
        } else if (membership === KnownMembership.Invite) {
          room = await client.joinRoom(roomId, {
            viaServers,
          });
        } else {
          // If the room does not exist we first search for it with viaServers
          let roomSummary: RoomSummary | undefined = undefined;
          try {
            roomSummary = await client.getRoomSummary(roomId, viaServers);
          } catch (error) {
            // If the room summary endpoint is not supported we let it be undefined and treat this case like
            // `JoinRule.Public`.
            // This is how the logic was done before: "we expect any room id passed to EC
            // to be for a public call" Which is definitely not ideal but worth a try if fetching
            // the summary crashes.
            logger.warn(
              `Could not load room summary to decide whether we want to join or knock.
              EC will fallback to join as if this would be a public room.
              Reach out to your homeserver admin to ask them about supporting the \`/summary\` endpoint (im.nheko.summary):`,
              error,
            );
          }
          if (
            roomSummary === undefined ||
            roomSummary.join_rule === JoinRule.Public
          ) {
            room = await client.joinRoom(roomId, {
              viaServers,
            });
          } else if (roomSummary.join_rule === JoinRule.Knock) {
            // bind room summary in this scope so we have it stored in a binding of type `RoomSummary`
            // instead of `RoomSummary | undefined`. Because we use it in a promise the linter does not accept
            // the type check from the if condition above.
            const _roomSummary = roomSummary;
            let knock: () => void = () => {};
            const userPressedAskToJoinPromise: Promise<void> = new Promise(
              (resolve) => {
                if (_roomSummary.membership !== KnownMembership.Knock) {
                  knock = resolve;
                } else {
                  // resolve immediately if the user already knocked
                  resolve();
                }
              },
            );
            setState({ kind: "canKnock", roomSummary: _roomSummary, knock });
            await userPressedAskToJoinPromise;
            room = await getRoomByKnocking(
              roomSummary.room_id,
              viaServers,
              () =>
                setState({ kind: "waitForInvite", roomSummary: _roomSummary }),
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
        client.on(RoomEvent.MyMembership, (_, membership) => {
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
