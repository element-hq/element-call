/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@vector-im/compound-web";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Avatar } from "../Avatar";
import { type CallParticipant } from "./useCallParticipants";
import styles from "./CallParticipantRow.module.css";

/** Maximum number of participant avatars to show before overflow. */
const DEFAULT_DISPLAY_LIMIT = 8;

interface Props {
  participants: CallParticipant[];
  displayLimit?: number;
}

/**
 * Renders a row of participant avatar circles with display names,
 * shown in the pre-join lobby when a call is active.
 * Overflowing participants are represented by a "..." item with a
 * +N count, with a tooltip showing the remaining names on hover.
 */
export const CallParticipantRow: FC<Props> = ({
  participants,
  displayLimit = DEFAULT_DISPLAY_LIMIT,
}) => {
  const { t } = useTranslation();

  const visibleParticipants = useMemo(
    () => participants.slice(0, displayLimit),
    [participants, displayLimit],
  );
  const overflowParticipants = useMemo(
    () => participants.slice(displayLimit),
    [participants, displayLimit],
  );
  const overflowCount = overflowParticipants.length;

  if (participants.length === 0) return null;

  const allNames = participants.map((p) => p.displayName);
  const screenReaderLabel =
    participants.length <= displayLimit
      ? t("lobby.participants_in_call", {
          count: participants.length,
          names: allNames.join(", "),
        })
      : t("lobby.participants_in_call_overflow", {
          count: participants.length,
          names: visibleParticipants.map((p) => p.displayName).join(", "),
          overflowCount,
        });

  return (
    <div
      className={styles.participantRow}
      role="list"
      aria-label={screenReaderLabel}
    >
      <VisuallyHidden>{screenReaderLabel}</VisuallyHidden>
      {visibleParticipants.map((participant) => (
        <div
          key={participant.userId}
          className={styles.participantItem}
          role="listitem"
        >
          <Avatar
            id={participant.userId}
            name={participant.displayName}
            src={participant.avatarUrl ?? undefined}
            size={48}
          />
          <span className={styles.participantName}>
            {participant.displayName}
          </span>
        </div>
      ))}
      {overflowCount > 0 && (
        <div role="listitem">
          <Tooltip
            label={overflowParticipants.map((p) => p.displayName).join(", ")}
          >
            <span
              className={styles.overflowItem}
              aria-label={t("lobby.participants_overflow_label", {
                count: overflowCount,
              })}
            >
              <span className={styles.overflowCircle}>…</span>
              <span className={styles.overflowCount}>
                {t("lobby.participants_overflow_count", {
                  count: overflowCount,
                })}
              </span>
            </span>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
