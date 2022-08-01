import React, { Key, useRef, useState } from "react";
import { AriaMenuOptions, useMenu, useMenuItem } from "@react-aria/menu";
import { TreeState, useTreeState } from "@react-stately/tree";
import { mergeProps } from "@react-aria/utils";
import { useFocus } from "@react-aria/interactions";
import classNames from "classnames";
import { Node } from "@react-types/shared";

import styles from "./Menu.module.css";

interface MenuProps<T> extends AriaMenuOptions<T> {
  className?: String;
  onClose?: () => void;
  onAction: (value: Key) => void;
  label?: string;
}

export function Menu<T extends object>({
  className,
  onAction,
  onClose,
  label,
  ...rest
}: MenuProps<T>) {
  const state = useTreeState<T>({ ...rest, selectionMode: "none" });
  const menuRef = useRef();
  const { menuProps } = useMenu<T>(rest, state, menuRef);

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
          onClose={onClose}
        />
      ))}
    </ul>
  );
}

interface MenuItemProps<T> {
  item: Node<T>;
  state: TreeState<T>;
  onAction: (value: Key) => void;
  onClose: () => void;
}

function MenuItem<T>({ item, state, onAction, onClose }: MenuItemProps<T>) {
  const ref = useRef();
  const { menuItemProps } = useMenuItem(
    {
      key: item.key,
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
