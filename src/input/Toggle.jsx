import React, { useRef } from "react";
import styles from "./Toggle.module.css";
import { useToggleButton } from "@react-aria/button";
import { useToggleState } from "@react-stately/toggle";
import classNames from "classnames";
import { Field } from "./Input";

export function Toggle({ id, label, className, ...rest }) {
  const buttonRef = useRef();
  const state = useToggleState(rest);
  const { buttonProps, isPressed } = useToggleButton(rest, state, buttonRef);

  return (
    <Field
      className={classNames(
        styles.toggle,
        { [styles.on]: isPressed },
        className
      )}
    >
      <button
        {...buttonProps}
        ref={buttonRef}
        id={id}
        className={classNames(styles.button, {
          [styles.isPressed]: isPressed,
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
