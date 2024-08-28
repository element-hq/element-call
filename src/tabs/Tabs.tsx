/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Key, ReactNode, useId } from "react";
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
          id={`${idPrefix}[${key}]`}
          style={{ display: key === tab ? undefined : "none" }}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
