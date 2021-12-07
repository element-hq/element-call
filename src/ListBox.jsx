import React, { useRef } from "react";
import { useListBox, useOption } from "@react-aria/listbox";
import styles from "./ListBox.module.css";
import classNames from "classnames";

export function ListBox(props) {
  const ref = useRef();
  let { listBoxRef = ref, state } = props;
  const { listBoxProps } = useListBox(props, state, listBoxRef);

  return (
    <ul
      {...listBoxProps}
      ref={listBoxRef}
      className={classNames(styles.listBox, props.className)}
    >
      {[...state.collection].map((item) => (
        <Option
          key={item.key}
          item={item}
          state={state}
          className={props.optionClassName}
        />
      ))}
    </ul>
  );
}

function Option({ item, state, className }) {
  const ref = useRef();
  const { optionProps, isSelected, isFocused, isDisabled } = useOption(
    { key: item.key },
    state,
    ref
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
