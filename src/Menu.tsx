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

import React, { Key, ReactNode, useRef, useState } from "react";
import { AriaMenuOptions, useMenu, useMenuItem } from "@react-aria/menu";
import { TreeState, useTreeState } from "@react-stately/tree";
import { mergeProps } from "@react-aria/utils";
import { useFocus } from "@react-aria/interactions";
import classNames from "classnames";
import { Node } from "@react-types/shared";

import styles from "./Menu.module.css";

interface MenuProps<T> extends AriaMenuOptions<T> {
  className?: string;
  onClose?: () => void;
  onAction: (value: Key) => void;
  label?: string;
  children: ReactNode;
}

export function Menu<T extends object>({
  className,
  onAction,
  onClose,
  label,
  ...rest
}: MenuProps<T>) {
  const state = useTreeState<T>({
    ...rest,
    selectionMode: "none",
    children: undefined,
  });
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
