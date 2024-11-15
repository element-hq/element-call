/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Button as CpdButton, Tooltip, Alert } from "@vector-im/compound-web";
import {
  RaisedHandSolidIcon,
  ReactionIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import {
  ComponentPropsWithoutRef,
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/src/logger";
import { EventType, RelationType } from "matrix-js-sdk/src/matrix";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import classNames from "classnames";

import { useReactions } from "../useReactions";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";
import styles from "./ReactionToggleButton.module.css";
import {
  ReactionOption,
  ReactionSet,
  ElementCallReactionEventType,
} from "../reactions";
import { Modal } from "../Modal";

interface InnerButtonProps extends ComponentPropsWithoutRef<"button"> {
  raised: boolean;
  open: boolean;
}

const InnerButton: FC<InnerButtonProps> = ({ raised, open, ...props }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("action.raise_hand_or_send_reaction")}>
      <CpdButton
        className={classNames(raised && styles.raisedButton)}
        aria-expanded={open}
        aria-haspopup
        aria-label={t("action.raise_hand_or_send_reaction")}
        kind={raised || open ? "primary" : "secondary"}
        iconOnly
        Icon={raised ? RaisedHandSolidIcon : ReactionIcon}
        {...props}
      />
    </Tooltip>
  );
};

export function ReactionPopupMenu({
  sendReaction,
  toggleRaisedHand,
  isHandRaised,
  canReact,
  errorText,
}: {
  sendReaction: (reaction: ReactionOption) => void;
  toggleRaisedHand: () => void;
  errorText?: string;
  isHandRaised: boolean;
  canReact: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const [isFullyExpanded, setExpanded] = useState(false);

  const filteredReactionSet = useMemo(
    () => (isFullyExpanded ? ReactionSet : ReactionSet.slice(0, 5)),
    [isFullyExpanded],
  );
  const label = isHandRaised ? t("action.lower_hand") : t("action.raise_hand");
  return (
    <>
      {errorText && (
        <Alert
          className={styles.alert}
          type="critical"
          title={t("common.something_went_wrong")}
        >
          {errorText}
        </Alert>
      )}
      <div className={styles.reactionPopupMenu}>
        <section className={styles.handRaiseSection}>
          <Tooltip label={label}>
            <CpdButton
              kind={isHandRaised ? "primary" : "secondary"}
              aria-pressed={isHandRaised}
              aria-label={label}
              onClick={() => toggleRaisedHand()}
              iconOnly
              Icon={RaisedHandSolidIcon}
            />
          </Tooltip>
        </section>
        <div className={styles.verticalSeperator} />
        <section className={styles.reactionsMenuSection}>
          <menu
            className={classNames(
              isFullyExpanded && styles.reactionsMenuExpanded,
              styles.reactionsMenu,
            )}
          >
            {filteredReactionSet.map((reaction) => (
              <li key={reaction.name}>
                <Tooltip label={reaction.name}>
                  <CpdButton
                    kind="secondary"
                    className={styles.reactionButton}
                    disabled={!canReact}
                    onClick={() => sendReaction(reaction)}
                  >
                    {reaction.emoji}
                  </CpdButton>
                </Tooltip>
              </li>
            ))}
          </menu>
        </section>
        <section style={{ marginLeft: "var(--cpd-separator-spacing)" }}>
          <Tooltip
            label={
              isFullyExpanded ? t("action.show_less") : t("action.show_more")
            }
          >
            <CpdButton
              iconOnly
              aria-label={
                isFullyExpanded ? t("action.show_less") : t("action.show_more")
              }
              Icon={isFullyExpanded ? ChevronUpIcon : ChevronDownIcon}
              kind="tertiary"
              onClick={() => setExpanded(!isFullyExpanded)}
            />
          </Tooltip>
        </section>
      </div>
    </>
  );
}

interface ReactionToggleButtonProps extends ComponentPropsWithoutRef<"button"> {
  rtcSession: MatrixRTCSession;
  client: MatrixClient;
}

export function ReactionToggleButton({
  client,
  rtcSession,
  ...props
}: ReactionToggleButtonProps): ReactNode {
  const { t } = useTranslation();
  const { raisedHands, lowerHand, reactions } = useReactions();
  const [busy, setBusy] = useState(false);
  const userId = client.getUserId()!;
  const isHandRaised = !!raisedHands[userId];
  const memberships = useMatrixRTCSessionMemberships(rtcSession);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  useEffect(() => {
    // Clear whenever the reactions menu state changes.
    setErrorText(undefined);
  }, [showReactionsMenu]);

  const canReact = !reactions[userId];

  const sendRelation = useCallback(
    async (reaction: ReactionOption) => {
      try {
        const myMembership = memberships.find((m) => m.sender === userId);
        if (!myMembership?.eventId) {
          throw new Error("Cannot find own membership event");
        }
        const parentEventId = myMembership.eventId;
        setBusy(true);
        await client.sendEvent(
          rtcSession.room.roomId,
          ElementCallReactionEventType,
          {
            "m.relates_to": {
              rel_type: RelationType.Reference,
              event_id: parentEventId,
            },
            emoji: reaction.emoji,
            name: reaction.name,
          },
        );
        setErrorText(undefined);
        setShowReactionsMenu(false);
      } catch (ex) {
        setErrorText(ex instanceof Error ? ex.message : "Unknown error");
        logger.error("Failed to send reaction", ex);
      } finally {
        setBusy(false);
      }
    },
    [memberships, client, userId, rtcSession],
  );

  const toggleRaisedHand = useCallback(() => {
    const raiseHand = async (): Promise<void> => {
      if (isHandRaised) {
        try {
          setBusy(true);
          await lowerHand();
          setShowReactionsMenu(false);
        } finally {
          setBusy(false);
        }
      } else {
        try {
          const myMembership = memberships.find((m) => m.sender === userId);
          if (!myMembership?.eventId) {
            throw new Error("Cannot find own membership event");
          }
          const parentEventId = myMembership.eventId;
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
          setErrorText(undefined);
          setShowReactionsMenu(false);
        } catch (ex) {
          setErrorText(ex instanceof Error ? ex.message : "Unknown error");
          logger.error("Failed to raise hand", ex);
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
    lowerHand,
    rtcSession.room.roomId,
    userId,
  ]);

  return (
    <>
      <InnerButton
        disabled={busy}
        onClick={() => setShowReactionsMenu((show) => !show)}
        raised={isHandRaised}
        open={showReactionsMenu}
        {...props}
      />
      <Modal
        open={showReactionsMenu}
        title={t("action.pick_reaction")}
        hideHeader
        classNameModal={styles.reactionPopupMenuModal}
        className={styles.reactionPopupMenuRoot}
        onDismiss={() => setShowReactionsMenu(false)}
      >
        <ReactionPopupMenu
          errorText={errorText}
          isHandRaised={isHandRaised}
          canReact={!busy && canReact}
          sendReaction={(reaction) => void sendRelation(reaction)}
          toggleRaisedHand={toggleRaisedHand}
        />
      </Modal>
    </>
  );
}
