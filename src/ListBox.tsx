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

import React, { useCallback, useRef } from "react";
import { useListBox, useOption, AriaListBoxOptions } from "@react-aria/listbox";
import { ListState } from "@react-stately/list";
import { Node } from "@react-types/shared";
import classNames from "classnames";

import styles from "./ListBox.module.css";

interface ListBoxProps<T> extends AriaListBoxOptions<T> {
  optionClassName: string;
  state: ListState<T>;
  className?: string;
  listBoxRef?: React.MutableRefObject<HTMLUListElement>;
}

export function ListBox<T>({
  state,
  optionClassName,
  className,
  listBoxRef,
  ...rest
}: ListBoxProps<T>) {
  const ref = useRef<HTMLUListElement>();
  if (!listBoxRef) listBoxRef = ref;

  const { listBoxProps } = useListBox(rest, state, listBoxRef);

  return (
    <ul
      {...listBoxProps}
      ref={listBoxRef}
      className={classNames(styles.listBox, className)}
    >
      {[...state.collection].map((item) => (
        <Option
          key={item.key}
          item={item}
          state={state}
          className={optionClassName}
        />
      ))}
    </ul>
  );
}

interface OptionProps<T> {
  className: string;
  state: ListState<T>;
  item: Node<T>;
}

function Option<T>({ item, state, className }: OptionProps<T>) {
  const ref = useRef();
  const { optionProps, isSelected, isFocused, isDisabled } = useOption(
    { key: item.key },
    state,
    ref
  );

  // Hack: remove the onPointerUp event handler and re-wire it to
  // onClick. Chrome Android triggers a click event after the onpointerup
  // event which leaks through to elements underneath the z-indexed select
  // popover. preventDefault / stopPropagation don't have any effect, even
  // adding just a dummy onClick handler still doesn't work, but it's fine
  // if we handle just onClick.
  // https://github.com/vector-im/element-call/issues/762
  const origPointerUp = optionProps.onPointerUp;
  delete optionProps.onPointerUp;
  optionProps.onClick = useCallback(
    (e) => {
      origPointerUp(e as unknown as React.PointerEvent<HTMLElement>);
    },
    [origPointerUp]
  );

  return (
    <li
      {...optionProps}
      ref={ref}
      className={classNames(styles.option, className, {
        [styles.selected]: isSelected,
        [styles.focused]: isFocused,
        [styles.disables]: isDisabled,
      })}
    >
      {item.rendered}
    </li>
  );
}
