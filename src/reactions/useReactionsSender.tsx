/*
Copyright 2024 Milton Moura <miltonmoura@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventType, type MatrixClient, RelationType } from "matrix-js-sdk";
import {
  createContext,
  use,
  type ReactNode,
  useCallback,
  type JSX,
} from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { useClientState } from "../ClientContext";
import { type TimelineDriver } from "../driver/ElementCallMatrixClientDriver";
import { ElementCallReactionEventType, type ReactionOption } from ".";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useBehavior } from "../useBehavior";

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
/** How to send and take back a reaction: a room event, and a redaction. */
export type ReactionsTimeline = Pick<
  TimelineDriver,
  "sendRoomEvent" | "redactEvent"
>;

/** {@link ReactionsTimeline} over a matrix-js-sdk client. */
export function jsSdkReactionsTimeline(
  client: Pick<MatrixClient, "sendEvent" | "redactEvent">,
  roomId: string,
): ReactionsTimeline {
  return {
    sendRoomEvent: async (eventType, content) => {
      const { event_id: eventId } = await client.sendEvent(
        roomId,
        eventType as never,
        content as never,
      );
      return { eventId };
    },
    redactEvent: async (eventId) => {
      await client.redactEvent(roomId, eventId);
    },
  };
}

export const ReactionsSenderProvider = ({
  children,
  vm,
  ownIdentifier,
  ownMembershipEventId,
  timeline,
}: {
  children: ReactNode;
  vm: CallViewModel;
  /** Our key in `vm.reactions$` / `vm.handsRaised$` (`${userId}:${deviceId}`). */
  ownIdentifier: string;
  /** The event id of our current membership, which reactions relate to. */
  ownMembershipEventId: string | undefined;
  timeline: ReactionsTimeline;
}): JSX.Element => {
  // A widget host may forbid reactions; without a client state (the
  // component, the crate path) there is nobody to forbid them.
  const clientState = useClientState();
  const supportsReactions =
    clientState === undefined ||
    (clientState.state === "valid" && clientState.supportedFeatures.reactions);

  const reactions = useBehavior(vm.reactions$);
  const myReaction = reactions[ownIdentifier];

  const handsRaised = useBehavior(vm.handsRaised$);
  const myRaisedHand = handsRaised[ownIdentifier];

  const toggleRaisedHand = useCallback(async () => {
    const myReactionId = myRaisedHand?.reactionEventId;

    if (!myReactionId) {
      try {
        if (!ownMembershipEventId) {
          throw new Error("Cannot find own membership event");
        }
        const { eventId } = await timeline.sendRoomEvent(EventType.Reaction, {
          "m.relates_to": {
            rel_type: RelationType.Annotation,
            event_id: ownMembershipEventId,
            key: "🖐️",
          },
        });
        logger.debug("Sent raise hand event", eventId);
      } catch (ex) {
        logger.error("Failed to send raised hand", ex);
      }
    } else {
      try {
        await timeline.redactEvent(myReactionId);
        logger.debug("Redacted raise hand event");
      } catch (ex) {
        logger.error("Failed to redact reaction event", myReactionId, ex);
        throw ex;
      }
    }
  }, [ownMembershipEventId, myRaisedHand, timeline]);

  const sendReaction = useCallback(
    async (reaction: ReactionOption) => {
      if (myReaction) {
        return;
      }
      if (!ownMembershipEventId) {
        throw new Error("Cannot find own membership event");
      }
      await timeline.sendRoomEvent(ElementCallReactionEventType, {
        "m.relates_to": {
          rel_type: RelationType.Reference,
          event_id: ownMembershipEventId,
        },
        emoji: reaction.emoji,
        name: reaction.name,
      });
    },
    [ownMembershipEventId, myReaction, timeline],
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
