/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useState,
  useEffect,
  useRef,
  type ComponentType,
  type SVGAttributes,
} from "react";
import {
  JoinRule,
  EventType,
  SyncState,
  MatrixError,
  KnownMembership,
  type Membership,
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
  EndCallIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { useUrlParams } from "../UrlParams";
import { type LobbyJoinState } from "./LobbyJoinState";
import {
  preJoinRoomInfoFromRoom,
  preJoinRoomInfoFromSummary,
  type PreJoinRoomInfo,
} from "./preJoinRoomInfo";

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

/**
 * The call cannot be entered yet, so the lobby is shown with whatever the user
 * can do about it.
 */
export type GroupCallLobby = {
  kind: "lobby";
  room: PreJoinRoomInfo;
  joinState: LobbyJoinState;
};

export type GroupCallStatus =
  | GroupCallLoaded
  | GroupCallLoadFailed
  | GroupCallLoading
  | GroupCallLobby;

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
   * Creates a new CallTerminatedMessage.
   *
   * @param icon The icon to display with the message
   * @param messageTitle The title of the call ended screen message (translated)
   * @param messageBody The message explaining the kind of termination
   * (kick, ban, knock reject, etc.) (translated)
   * @param reason  The user-provided reason for the termination (kick/ban)
   */
  public constructor(
    public readonly icon: ComponentType<SVGAttributes<SVGElement>>,
    messageTitle: string,
    public readonly messageBody: string,
    public readonly reason?: string,
  ) {
    super(messageTitle);
  }
}

/** The join state a lobby opens on, before the user acts on it. */
type LobbyEntry =
  | "can-join"
  | "can-ask-to-join"
  | "waiting-for-approval"
  | "denied"
  | "banned"
  | "not-allowed";

export const useLoadGroupCall = (
  client: MatrixClient | undefined,
  roomIdOrAlias: string | null,
  viaServers: string[],
): GroupCallStatus => {
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });
  const activeRoom = useRef<Room | undefined>(undefined);
  const { t } = useTranslation();
  const { isWidget } = useUrlParams();

  useEffect(() => {
    if (!client || !roomIdOrAlias) {
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;

    /** Adds a client listener that is removed when the effect is cleaned up. */
    const onMyMembership = (
      listener: (
        room: Room,
        membership: Membership,
        prevMembership?: Membership,
      ) => void,
    ): (() => void) => {
      client.on(RoomEvent.MyMembership, listener);
      const off = (): void => {
        client.off(RoomEvent.MyMembership, listener);
      };
      signal.addEventListener("abort", off);
      return off;
    };

    const leaveReason = (): string =>
      activeRoom.current?.currentState
        .getStateEvents(EventType.RoomMember, activeRoom.current?.myUserId)
        ?.getContent().reason;

    const bannedError = (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        AdminIcon,
        t("group_call_loader.banned_heading"),
        t("group_call_loader.banned_body"),
        leaveReason(),
      );
    const removeNoticeError = (): CallTerminatedMessage =>
      new CallTerminatedMessage(
        EndCallIcon,
        t("group_call_loader.call_ended_heading"),
        t("group_call_loader.call_ended_body"),
        leaveReason(),
      );

    /**
     * Wait for the room to be usable for group calls. Widget mode has no
     * equivalent gate, because the host owns the sync.
     */
    const readyForGroupCalls = async (room: Room): Promise<Room> => {
      logger.info(
        `Joined ${room.roomId}, waiting for the room to be ready for group calls`,
      );
      await client.waitUntilRoomReadyForGroupCalls(room.roomId);
      logger.info(`${room.roomId} is ready for group calls`);
      return room;
    };

    const getRoomByAlias = async (alias: string): Promise<Room> => {
      // We lowercase the localpart when we create the room, so we must lowercase
      // it here too (we just do the whole alias). We can't do the same to room IDs
      // though.
      // Also, we explicitly look up the room alias here. We previously just tried to
      // join anyway but the js-sdk recreates the room if you pass the alias for a
      // room you're already joined to (which it probably ought not to).
      const lookupResult = await client.getRoomIdForAlias(alias.toLowerCase());
      logger.info(`${alias} resolved to ${lookupResult.room_id}`);
      const room = client.getRoom(lookupResult.room_id);
      if (room) {
        logger.info(`Already in room ${lookupResult.room_id}, not rejoining.`);
        return room;
      }
      logger.info(`Room ${lookupResult.room_id} not found, joining.`);
      return await readyForGroupCalls(
        await client.joinRoom(lookupResult.room_id, {
          viaServers: lookupResult.servers,
        }),
      );
    };

    /**
     * Resolve once the local user has joined the room, including when they
     * already have: the host may have joined us before we could listen.
     */
    const waitForJoin = async (roomId: string): Promise<Room> =>
      await new Promise<Room>((resolve) => {
        const reached = (room: Room | null): boolean => {
          if (room?.getMyMembership() !== KnownMembership.Join) return false;
          activeRoom.current = room;
          resolve(room);
          return true;
        };
        const off = onMyMembership((room) => {
          if (room.roomId === roomId && reached(room)) off();
        });
        if (reached(client.getRoom(roomId))) off();
      });

    /**
     * Show the lobby and resolve once the local user has joined. Denial, ban
     * and a room that takes nothing from this user are lobby states rather
     * than errors, so the promise never resolves and the render follows the
     * join state.
     *
     * @param room The room as far as it is knowable before joining
     * @param entry The join state to open on
     */
    const enterFromLobby = async (
      room: PreJoinRoomInfo,
      entry: LobbyEntry,
    ): Promise<Room> => {
      const roomId = room.roomId;
      let requestInFlight = false;
      let withdrawing = false;

      const setLobby = (joinState: LobbyJoinState): void => {
        if (!signal.aborted) setState({ kind: "lobby", room, joinState });
      };

      const waitForApproval = (): void =>
        setLobby({ kind: "waiting-for-approval", cancelRequest });

      const canAskToJoin = (error?: "request_failed"): void =>
        setLobby({ kind: "can-ask-to-join", askToJoin, error });

      const canJoin = (): void => setLobby({ kind: "can-join", join });

      const onRequestError = (
        error: unknown,
        operation: string,
        onFailure: () => void,
      ): void => {
        requestInFlight = false;
        // A refusal by the server means this user cannot get in this way at all.
        if (error instanceof MatrixError && error.errcode === "M_FORBIDDEN") {
          logger.warn(`${operation} on ${roomId} was refused`, error);
          setLobby({ kind: "not-allowed" });
        } else {
          logger.error(`${operation} on ${roomId} failed`, error);
          onFailure();
        }
      };

      const join = (): void => {
        if (requestInFlight) return;
        requestInFlight = true;
        // A join of our own resolves the promise this lobby is parked on, so
        // there is nothing to show on success.
        client.joinRoom(roomId, { viaServers }).then(
          () => {
            requestInFlight = false;
          },
          (error: unknown) => onRequestError(error, "Joining", canJoin),
        );
      };

      const askToJoin = (reason?: string): void => {
        if (requestInFlight) return;
        requestInFlight = true;
        setLobby({ kind: "sending-request" });
        client.knockRoom(roomId, { viaServers, reason }).then(
          () => {
            requestInFlight = false;
            waitForApproval();
          },
          (error: unknown) =>
            onRequestError(error, "Asking to join", () =>
              canAskToJoin("request_failed"),
            ),
        );
      };

      const cancelRequest = (): void => {
        if (withdrawing) return;
        withdrawing = true;
        // Drop the link while the withdrawal is on its way, so it cannot be
        // pressed twice.
        setLobby({ kind: "waiting-for-approval" });
        client.leave(roomId).catch((error: unknown) => {
          withdrawing = false;
          logger.error("Failed to withdraw the request to join", error);
          waitForApproval();
        });
      };

      const offTransitions = onMyMembership(
        (changed, membership, prevMembership) => {
          if (changed.roomId !== roomId) return;
          activeRoom.current = changed;
          switch (membership) {
            case KnownMembership.Invite:
              if (prevMembership !== KnownMembership.Knock) canJoin();
              else
                joinRoomAfterInvite(client, 0, roomId, { viaServers }).then(
                  () => logger.info(`Joined ${roomId} once accepted`),
                  (error: unknown) =>
                    logger.error(
                      `Joining ${roomId} once accepted failed`,
                      error,
                    ),
                );
              break;
            case KnownMembership.Ban:
              setLobby({ kind: "banned", reason: leaveReason() });
              break;
            case KnownMembership.Leave:
              // Withdrawing a request produces the same membership as a decline,
              // so the two are told apart by who initiated it.
              if (withdrawing) {
                withdrawing = false;
                canAskToJoin();
              } else {
                setLobby({ kind: "denied" });
              }
              break;
          }
        },
      );

      switch (entry) {
        case "can-join":
          canJoin();
          break;
        case "can-ask-to-join":
          canAskToJoin();
          break;
        case "waiting-for-approval":
          waitForApproval();
          break;
        case "denied":
          setLobby({ kind: "denied" });
          break;
        case "banned":
          setLobby({ kind: "banned", reason: leaveReason() });
          break;
        case "not-allowed":
          setLobby({ kind: "not-allowed" });
          break;
      }

      const joined = await waitForJoin(roomId);
      offTransitions();
      return joined;
    };

    const fetchOrCreateRoom = async (): Promise<Room> => {
      if (roomIdOrAlias[0] === "#") {
        const room = await getRoomByAlias(roomIdOrAlias);
        activeRoom.current = room;
        return room;
      }
      const roomId = roomIdOrAlias;

      // The room already exists in widget mode, and in SPA mode if the user
      // has joined it before.
      const room = client.getRoom(roomId);
      activeRoom.current = room ?? undefined;
      const membership = room?.getMyMembership();
      if (membership === KnownMembership.Join) return room!;

      if (isWidget)
        // in widget mode we never should reach this point. (getRoom should return the room.)
        throw new Error(
          "Room not found. The widget-api did not pass over the relevant room events/information.",
        );

      if (room && membership === KnownMembership.Ban)
        return await enterFromLobby(preJoinRoomInfoFromRoom(room), "banned");
      if (membership === KnownMembership.Invite)
        return await readyForGroupCalls(
          await client.joinRoom(roomId, { viaServers }),
        );

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
        roomSummary?.join_rule === undefined ||
        roomSummary.join_rule === JoinRule.Public
      )
        return await readyForGroupCalls(
          await client.joinRoom(roomId, { viaServers }),
        );

      const roomInfo = preJoinRoomInfoFromSummary(roomSummary);
      if (roomSummary.membership === KnownMembership.Ban)
        return await enterFromLobby(roomInfo, "banned");
      if (roomSummary.join_rule === JoinRule.Knock)
        return await readyForGroupCalls(
          await enterFromLobby(
            roomInfo,
            roomSummary.membership === KnownMembership.Knock
              ? "waiting-for-approval"
              : "can-ask-to-join",
          ),
        );
      logger.info(
        `Room ${roomSummary.room_id} takes neither joins nor knocks (join rule ${roomSummary.join_rule})`,
      );
      return await enterFromLobby(roomInfo, "not-allowed");
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
          signal.addEventListener("abort", () => {
            client.off(ClientEvent.Sync, onSync);
          });
        });
        logger.debug("useLoadGroupCall: client is now syncing.");
      }
    };

    const observeMyMembership = async (): Promise<void> => {
      await new Promise((_, reject) => {
        onMyMembership((_room, membership) => {
          if (membership === KnownMembership.Leave) reject(removeNoticeError());
          if (membership === KnownMembership.Ban) reject(bannedError());
        });
      });
    };

    logger.log("Start loading group call");
    waitForClientSyncing()
      .then(fetchOrCreateGroupCall)
      .then((rtcSession) => {
        if (!signal.aborted) setState({ kind: "loaded", rtcSession });
      })
      .then(observeMyMembership)
      .catch((error) => {
        if (!signal.aborted) setState({ kind: "failed", error });
      });

    return (): void => controller.abort();
  }, [client, isWidget, roomIdOrAlias, viaServers, t]);

  return state;
};
