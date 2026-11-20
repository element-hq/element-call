/*
Copyright 2024 Milton Moura <miltonmoura@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  EventType,
  type MatrixClient,
  RelationType,
  type Room,
} from "matrix-js-sdk";
import {
  createContext,
  use,
  type ReactNode,
  useCallback,
  useMemo,
  type JSX,
} from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { useClientState } from "../ClientContext";
import { ElementCallReactionEventType, type ReactionOption } from ".";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useBehavior } from "../useBehavior";
import { constant } from "../state/Behavior";

const noMembershipEvent$ = constant(undefined);

interface ReactionsSenderContextType {
  supportsReactions: boolean;
  toggleRaisedHand: () => Promise<void>;
  sendReaction: (reaction: ReactionOption) => Promise<void>;
}

export const ReactionsSenderContext = createContext<
  ReactionsSenderContextType | undefined
>(undefined);

export const useReactionsSender = (): ReactionsSenderContextType => {
  const context = use(ReactionsSenderContext);
  if (!context) {
    throw new Error("useReactions must be used within a ReactionsProvider");
  }
  return context;
};

/**
 * Provider that handles sending a reaction or hand raised event to a call.
 */
export const ReactionsSenderProvider = ({
  children,
  room,
  client,
  vm,
}: {
  children: ReactNode;
  /** The room the reactions are sent in. */
  room: Pick<Room, "roomId">;
  client: Pick<
    MatrixClient,
    // Our own identity, which reactions and raised hands are keyed by
    | "getUserId"
    | "getDeviceId"
    // Sending reactions and raising a hand
    | "sendEvent"
    // Lowering a hand
    | "redactEvent"
  >;
  /** Our own membership, which the reactions relate to, and the current reactions. */
  vm: CallViewModel;
}): JSX.Element => {
  const clientState = useClientState();
  const supportsReactions =
    clientState?.state === "valid" && clientState.supportedFeatures.reactions;
  const myMembershipIdentifier = `${client.getUserId()}:${client.getDeviceId()}`;

  const localMember = useBehavior(vm.localMember$);
  const myMembershipEvent = useBehavior(
    localMember?.matrixEventId$ ?? noMembershipEvent$,
  );

  const reactions = useBehavior(vm.reactions$);
  const myReaction = useMemo(
    () =>
      myMembershipIdentifier !== undefined
        ? reactions[myMembershipIdentifier]
        : undefined,
    [myMembershipIdentifier, reactions],
  );

  const handsRaised = useBehavior(vm.handsRaised$);
  const myRaisedHand = useMemo(
    () =>
      myMembershipIdentifier !== undefined
        ? handsRaised[myMembershipIdentifier]
        : undefined,
    [myMembershipIdentifier, handsRaised],
  );

  const toggleRaisedHand = useCallback(async () => {
    if (!myMembershipIdentifier) {
      return;
    }
    const myReactionId = myRaisedHand?.reactionEventId;

    if (!myReactionId) {
      try {
        if (!myMembershipEvent) {
          throw new Error("Cannot find own membership event");
        }
        const reaction = await client.sendEvent(
          room.roomId,
          EventType.Reaction,
          {
            "m.relates_to": {
              rel_type: RelationType.Annotation,
              event_id: myMembershipEvent,
              key: "🖐️",
            },
          },
        );
        logger.debug("Sent raise hand event", reaction.event_id);
      } catch (ex) {
        logger.error("Failed to send raised hand", ex);
      }
    } else {
      try {
        await client.redactEvent(room.roomId, myReactionId);
        logger.debug("Redacted raise hand event");
      } catch (ex) {
        logger.error("Failed to redact reaction event", myReactionId, ex);
        throw ex;
      }
    }
  }, [myMembershipEvent, myMembershipIdentifier, myRaisedHand, client, room]);

  const sendReaction = useCallback(
    async (reaction: ReactionOption) => {
      if (!myMembershipIdentifier || myReaction) {
        // We're still reacting
        return;
      }
      if (!myMembershipEvent) {
        throw new Error("Cannot find own membership event");
      }
      await client.sendEvent(room.roomId, ElementCallReactionEventType, {
        "m.relates_to": {
          rel_type: RelationType.Reference,
          event_id: myMembershipEvent,
        },
        emoji: reaction.emoji,
        name: reaction.name,
      });
    },
    [myMembershipEvent, myReaction, client, room, myMembershipIdentifier],
  );

  return (
    <ReactionsSenderContext
      value={{
        supportsReactions,
        toggleRaisedHand,
        sendReaction,
      }}
    >
      {children}
    </ReactionsSenderContext>
  );
};
