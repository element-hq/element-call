/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Button as CpdButton, Tooltip, Alert } from "@vector-im/compound-web";
import {
  RaisedHandSolidIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ReactionSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import {
  type ComponentPropsWithoutRef,
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";
import classNames from "classnames";

import { useReactionsSender } from "../reactions/useReactionsSender";
import styles from "./ReactionToggleButton.module.css";
import {
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "../reactions";
import { Modal } from "../Modal";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useBehavior } from "../useBehavior";

interface InnerButtonProps extends ComponentPropsWithoutRef<"button"> {
  raised: boolean;
  open: boolean;
}

const InnerButton: FC<InnerButtonProps> = ({ raised, open, ...props }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.reactions")}>
      <CpdButton
        className={classNames(raised && styles.raisedButton)}
        aria-expanded={open}
        aria-haspopup
        kind={raised || open ? "primary" : "secondary"}
        iconOnly
        Icon={raised ? RaisedHandSolidIcon : ReactionSolidIcon}
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
          title={t("error.generic")}
        >
          {errorText}
        </Alert>
      )}
      <div className={styles.reactionPopupMenu}>
        <section className={styles.handRaiseSection}>
          <Tooltip label={label} caption="H">
            <CpdButton
              kind={isHandRaised ? "primary" : "secondary"}
              aria-keyshortcuts="H"
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
            {filteredReactionSet.map((reaction, index) => (
              <li key={reaction.name}>
                <Tooltip
                  label={reaction.name}
                  caption={
                    index < ReactionsRowSize
                      ? (index + 1).toString()
                      : undefined
                  }
                >
                  <CpdButton
                    kind="secondary"
                    className={styles.reactionButton}
                    disabled={!canReact}
                    onClick={() => sendReaction(reaction)}
                    aria-keyshortcuts={
                      index < ReactionsRowSize
                        ? (index + 1).toString()
                        : undefined
                    }
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
  identifier: string;
  vm: CallViewModel;
}

export function ReactionToggleButton({
  identifier,
  vm,
  ...props
}: ReactionToggleButtonProps): ReactNode {
  const { t } = useTranslation();
  const { toggleRaisedHand, sendReaction } = useReactionsSender();
  const [busy, setBusy] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const isHandRaised = !!useBehavior(vm.handsRaised$)[identifier];
  const canReact = !useBehavior(vm.reactions$)[identifier];

  useEffect(() => {
    // Clear whenever the reactions menu state changes.
    setErrorText(undefined);
  }, [showReactionsMenu]);

  const sendRelation = useCallback(
    async (reaction: ReactionOption) => {
      try {
        setBusy(true);
        await sendReaction(reaction);
        setErrorText(undefined);
        setShowReactionsMenu(false);
      } catch (ex) {
        setErrorText(ex instanceof Error ? ex.message : "Unknown error");
        logger.error("Failed to send reaction", ex);
      } finally {
        setBusy(false);
      }
    },
    [sendReaction],
  );

  const wrappedToggleRaisedHand = useCallback(() => {
    const toggleHand = async (): Promise<void> => {
      try {
        setBusy(true);
        await toggleRaisedHand();
        setShowReactionsMenu(false);
      } catch (ex) {
        setErrorText(ex instanceof Error ? ex.message : "Unknown error");
        logger.error("Failed to raise/lower hand", ex);
      } finally {
        setBusy(false);
      }
    };

    void toggleHand();
  }, [toggleRaisedHand]);

  return (
    <>
      <InnerButton
        disabled={busy}
        onClick={() => setShowReactionsMenu((show) => !show)}
        raised={!!isHandRaised}
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
          isHandRaised={!!isHandRaised}
          canReact={!busy && !!canReact}
          sendReaction={(reaction) => void sendRelation(reaction)}
          toggleRaisedHand={wrappedToggleRaisedHand}
        />
      </Modal>
    </>
  );
}
