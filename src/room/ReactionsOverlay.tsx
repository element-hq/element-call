/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode } from "react";

import styles from "./ReactionsOverlay.module.css";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useBehavior } from "../useBehavior";

export function ReactionsOverlay({ vm }: { vm: CallViewModel }): ReactNode {
  const reactionsIcons = useBehavior(vm.visibleReactions$);
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
