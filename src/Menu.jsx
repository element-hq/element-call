import React, { useRef, useState } from "react";
import styles from "./Menu.module.css";
import { useMenu, useMenuItem } from "@react-aria/menu";
import { useTreeState } from "@react-stately/tree";
import { mergeProps } from "@react-aria/utils";
import { useFocus } from "@react-aria/interactions";
import classNames from "classnames";

export function Menu({ className, onAction, ...rest }) {
  const state = useTreeState({ ...rest, selectionMode: "none" });
  const menuRef = useRef();
  const { menuProps } = useMenu(rest, state, menuRef);

  return (
    <ul
      {...mergeProps(menuProps, rest)}
      ref={menuRef}
      className={classNames(styles.menu, className)}
    >
      {[...state.collection].map((item) => (
        <MenuItem
          key={item.key}
          item={item}
          state={state}
          onAction={onAction}
          onClose={rest.onClose}
        />
      ))}
    </ul>
  );
}

function MenuItem({ item, state, onAction, onClose }) {
  const ref = useRef();
  const { menuItemProps } = useMenuItem(
    {
      key: item.key,
      isDisabled: item.isDisabled,
      onAction,
      onClose,
    },
    state,
    ref
  );

  const [isFocused, setFocused] = useState(false);
  const { focusProps } = useFocus({ onFocusChange: setFocused });

  return (
    <li
      {...mergeProps(menuItemProps, focusProps)}
      ref={ref}
      className={classNames(styles.menuItem, {
        [styles.focused]: isFocused,
      })}
    >
      {item.rendered}
    </li>
  );
}
