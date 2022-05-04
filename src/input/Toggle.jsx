import React, { useCallback, useRef } from "react";
import styles from "./Toggle.module.css";
import { useToggleButton } from "@react-aria/button";
import classNames from "classnames";
import { Field } from "./Input";

export function Toggle({ id, label, className, onChange, isSelected }) {
  const buttonRef = useRef();
  const toggle = useCallback(() => {
    onChange(!isSelected);
  });
  const { buttonProps } = useToggleButton(
    { isSelected },
    { toggle },
    buttonRef
  );

  return (
    <Field
      className={classNames(
        styles.toggle,
        { [styles.on]: isSelected },
        className
      )}
    >
      <button
        {...buttonProps}
        ref={buttonRef}
        id={id}
        className={classNames(styles.button, {
          [styles.isPressed]: isSelected,
        })}
      >
        <div className={styles.ball} />
      </button>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
    </Field>
  );
}
