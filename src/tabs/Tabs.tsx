/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Key, type ReactNode, useId } from "react";
import { NavBar, NavItem } from "@vector-im/compound-web";

import styles from "./Tabs.module.css";

export interface Tab<K extends Key> {
  key: K;
  name: string;
  content: ReactNode;
}

interface Props<K extends Key> {
  label: string;
  tab: K;
  onTabChange: (key: K) => void;
  tabs: Tab<K>[];
}

export function TabContainer<K extends Key>({
  label,
  tab,
  onTabChange,
  tabs,
}: Props<K>): ReactNode {
  const idPrefix = useId();

  return (
    <div className={styles.tabContainer}>
      <NavBar role="tablist" aria-label={label} className={styles.tabList}>
        {tabs.map(({ key, name }) => (
          <NavItem
            key={key}
            aria-controls={`${idPrefix}[${key}]`}
            onClick={() => onTabChange(key)}
            active={key === tab}
          >
            {name}
          </NavItem>
        ))}
      </NavBar>
      {tabs.map(({ key, content }) => (
        <div
          key={key}
          id={`${idPrefix}[${key}]`}
          style={{ display: key === tab ? undefined : "none" }}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
