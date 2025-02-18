/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type PropsWithChildren, type ReactNode } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import styles from "./ReactionIndicator.module.css";

export function ReactionIndicator({
  emoji,
  miniature,
  children,
}: PropsWithChildren<{
  miniature?: boolean;
  emoji: string;
}>): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      className={classNames(styles.reactionIndicatorWidget, {
        [styles.reactionIndicatorWidgetLarge]: !miniature,
      })}
    >
      <div
        className={classNames(styles.reaction, {
          [styles.reactionLarge]: !miniature,
        })}
      >
        <span role="img" aria-label={t("common.reaction")}>
          {emoji}
        </span>
      </div>
      {children}
    </div>
  );
}
