/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useMemo } from "react";

import { useReactions } from "../useReactions";
import {
  showReactions as showReactionsSetting,
  useSetting,
} from "../settings/settings";
import styles from "./ReactionsOverlay.module.css";

export function ReactionsOverlay(): ReactNode {
  const { reactions } = useReactions();
  const [showReactions] = useSetting(showReactionsSetting);
  const reactionsIcons = useMemo(
    () =>
      showReactions
        ? Object.entries(reactions).map(([sender, { emoji }]) => ({
            sender,
            emoji,
            startX: Math.ceil(Math.random() * 80) + 10,
          }))
        : [],
    [showReactions, reactions],
  );

  return (
    <div className={styles.container}>
      {reactionsIcons.map(({ sender, emoji, startX }) => (
        <span
          // Reactions effects are considered presentation elements. The reaction
          // is also present on the sender's tile, which assistive technology can
          // read from instead.
          role="presentation"
          style={{ left: `${startX}vw` }}
          className={styles.reaction}
          // A sender can only send one emoji at a time.
          key={sender}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
