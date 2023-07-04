/*
Copyright 2022 New Vector Ltd

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

import { useRef } from "react";
import { useTabList, useTab, useTabPanel } from "@react-aria/tabs";
import { Item } from "@react-stately/collections";
import { useTabListState, TabListState } from "@react-stately/tabs";
import classNames from "classnames";
import { AriaTabPanelProps, TabListProps } from "@react-types/tabs";
import { Node } from "@react-types/shared";

import styles from "./Tabs.module.css";

interface TabContainerProps<T> extends TabListProps<T> {
  className?: string;
}

export function TabContainer<T extends object>(
  props: TabContainerProps<T>
): JSX.Element {
  const state = useTabListState<T>(props);
  const ref = useRef<HTMLUListElement>();
  const { tabListProps } = useTabList(props, state, ref);
  return (
    <div className={classNames(styles.tabContainer, props.className)}>
      <ul {...tabListProps} ref={ref} className={styles.tabList}>
        {[...state.collection].map((item) => (
          <Tab item={item} state={state} key={item.key} />
        ))}
      </ul>
      <TabPanel key={state.selectedItem?.key} state={state} />
    </div>
  );
}

interface TabProps<T> {
  item: Node<T>;
  state: TabListState<T>;
}

function Tab<T>({ item, state }: TabProps<T>): JSX.Element {
  const { key, rendered } = item;
  const ref = useRef<HTMLLIElement>();
  const { tabProps } = useTab({ key }, state, ref);

  return (
    <li
      {...tabProps}
      ref={ref}
      className={classNames(styles.tab, {
        [styles.selected]: state.selectedKey === key,
        [styles.disabled]: state.disabledKeys.has(key),
      })}
    >
      {rendered}
    </li>
  );
}

interface TabPanelProps<T> extends AriaTabPanelProps {
  state: TabListState<T>;
}

function TabPanel<T>({ state, ...props }: TabPanelProps<T>): JSX.Element {
  const ref = useRef<HTMLDivElement>();
  const { tabPanelProps } = useTabPanel(props, state, ref);
  return (
    <div {...tabPanelProps} ref={ref} className={styles.tabPanel}>
      {state.selectedItem?.props.children}
    </div>
  );
}

export const TabItem = Item;
