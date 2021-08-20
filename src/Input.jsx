import React, { forwardRef } from "react";
import classNames from "classnames";
import styles from "./Input.module.css";

export function FieldRow({ children, rightAlign, className, ...rest }) {
  return (
    <div
      className={classNames(
        styles.fieldRow,
        { [styles.rightAlign]: rightAlign },
        className
      )}
    >
      {children}
    </div>
  );
}

export function Field({ children, className, ...rest }) {
  return <div className={classNames(styles.field, className)}>{children}</div>;
}

export const InputField = forwardRef(
  ({ id, label, className, ...rest }, ref) => {
    return (
      <Field>
        <input id={id} {...rest} ref={ref} />
        <label htmlFor={id}>{label}</label>
      </Field>
    );
  }
);

export const Button = forwardRef(({ className, children, ...rest }, ref) => {
  return (
    <button
      className={classNames(styles.button, className)}
      ref={ref}
      {...rest}
    >
      {children}
    </button>
  );
});

export function ErrorMessage({ children }) {
  return <p className={styles.errorMessage}>{children}</p>;
}
