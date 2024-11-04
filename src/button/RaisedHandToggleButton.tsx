/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Button as CpdButton, Tooltip } from "@vector-im/compound-web";
import {
  ComponentPropsWithoutRef,
  FC,
  ReactNode,
  useCallback,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/src/logger";
import { EventType, RelationType } from "matrix-js-sdk/src/matrix";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

import { useReactions } from "../useReactions";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";

interface InnerButtonProps extends ComponentPropsWithoutRef<"button"> {
  raised: boolean;
}

const InnerButton: FC<InnerButtonProps> = ({ raised, ...props }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.raise_hand")}>
      <CpdButton
        kind={raised ? "primary" : "secondary"}
        {...props}
        style={{ paddingLeft: 8, paddingRight: 8 }}
      >
        <p
          role="img"
          aria-hidden
          style={{
            width: "30px",
            height: "0px",
            display: "inline-block",
            fontSize: "22px",
          }}
        >
          ✋
        </p>
      </CpdButton>
    </Tooltip>
  );
};

interface RaisedHandToggleButtonProps {
  rtcSession: MatrixRTCSession;
  client: MatrixClient;
}

export function RaiseHandToggleButton({
  client,
  rtcSession,
}: RaisedHandToggleButtonProps): ReactNode {
  const { raisedHands, myReactionId } = useReactions();
  const [busy, setBusy] = useState(false);
  const userId = client.getUserId()!;
  const isHandRaised = !!raisedHands[userId];
  const memberships = useMatrixRTCSessionMemberships(rtcSession);

  const toggleRaisedHand = useCallback(() => {
    const raiseHand = async (): Promise<void> => {
      if (isHandRaised) {
        if (!myReactionId) {
          logger.warn(`Hand raised but no reaction event to redact!`);
          return;
        }
        try {
          setBusy(true);
          await client.redactEvent(rtcSession.room.roomId, myReactionId);
          logger.debug("Redacted raise hand event");
        } catch (ex) {
          logger.error("Failed to redact reaction event", myReactionId, ex);
        } finally {
          setBusy(false);
        }
      } else {
        const myMembership = memberships.find((m) => m.sender === userId);
        if (!myMembership?.eventId) {
          logger.error("Cannot find own membership event");
          return;
        }
        const parentEventId = myMembership.eventId;
        try {
          setBusy(true);
          const reaction = await client.sendEvent(
            rtcSession.room.roomId,
            EventType.Reaction,
            {
              "m.relates_to": {
                rel_type: RelationType.Annotation,
                event_id: parentEventId,
                key: "🖐️",
              },
            },
          );
          logger.debug("Sent raise hand event", reaction.event_id);
        } catch (ex) {
          logger.error("Failed to send reaction event", ex);
        } finally {
          setBusy(false);
        }
      }
    };

    void raiseHand();
  }, [
    client,
    isHandRaised,
    memberships,
    myReactionId,
    rtcSession.room.roomId,
    userId,
  ]);

  return (
    <InnerButton
      disabled={busy}
      onClick={toggleRaisedHand}
      raised={isHandRaised}
    />
  );
}
