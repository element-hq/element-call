/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { useRef } from "react";
import { useTabList, useTab, useTabPanel } from "@react-aria/tabs";
import { Item } from "@react-stately/collections";
import { useTabListState, TabListState } from "@react-stately/tabs";
import classNames from "classnames";
import { AriaTabPanelProps, TabListProps } from "@react-types/tabs";
import { Node } from "@react-types/shared";

// import {Collection} from
import styles from "./Tabs.module.css";

interface TabContainerProps extends TabListProps<JSX.Element> {
  className?: string;
}

export function TabContainer(props: TabContainerProps) {
  const state = useTabListState(props);
  const ref = useRef();
  const { tabListProps } = useTabList(props, state, ref);
  return (
    <div className={classNames(styles.tabContainer, props.className)}>
      <ul {...tabListProps} ref={ref} className={styles.tabList}>
        {[...state.collection].map((item) => (
          <Tab item={item} state={state} />
        ))}
      </ul>
      <TabPanel key={state.selectedItem?.key} state={state} />
    </div>
  );
}

interface TabProps {
  item: Node<JSX.Element>;
  state: TabListState<object>;
}

function Tab({ item, state }: TabProps) {
  const { key, rendered } = item;
  const ref = useRef();
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

interface TabPanelProps extends AriaTabPanelProps {
  state: TabListState<object>;
}

function TabPanel({ state, ...props }: TabPanelProps) {
  const ref = useRef();
  const { tabPanelProps } = useTabPanel(props, state, ref);
  return (
    <div {...tabPanelProps} ref={ref} className={styles.tabPanel}>
      {state.selectedItem?.props.children}
    </div>
  );
}

export const TabItem = Item;
