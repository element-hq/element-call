import React, { useRef } from "react";
import { useTabList, useTab, useTabPanel } from "@react-aria/tabs";
import { Item } from "@react-stately/collections";
import { useTabListState } from "@react-stately/tabs";
import styles from "./Tabs.module.css";
import classNames from "classnames";

export function TabContainer(props) {
  const state = useTabListState(props);
  const ref = useRef();
  const { tabListProps } = useTabList(props, state, ref);
  return (
    <div className={classNames(styles.tabContainer, props.className)}>
      <ul {...tabListProps} ref={ref} className={styles.tabList}>
        {[...state.collection].map((item) => (
          <Tab key={item.key} item={item} state={state} />
        ))}
      </ul>
      <TabPanel key={state.selectedItem?.key} state={state} />
    </div>
  );
}

function Tab({ item, state }) {
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

function TabPanel({ state, ...props }) {
  const ref = useRef();
  const { tabPanelProps } = useTabPanel(props, state, ref);
  return (
    <div {...tabPanelProps} ref={ref} className={styles.tabPanel}>
      {state.selectedItem?.props.children}
    </div>
  );
}

export const TabItem = Item;
