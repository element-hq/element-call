import React, { forwardRef } from "react";
import classNames from "classnames";
import styles from "./Input.module.css";
import { ReactComponent as CheckIcon } from "./icons/Check.svg";

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
  ({ id, label, className, type, checked, prefix, suffix, ...rest }, ref) => {
    return (
      <Field
        className={classNames(
          type === "checkbox" ? styles.checkboxField : styles.inputField,
          { [styles.prefix]: !!prefix },
          className
        )}
      >
        {prefix && <span>{prefix}</span>}
        <input id={id} {...rest} ref={ref} type={type} checked={checked} />
        <label htmlFor={id}>
          {type === "checkbox" && (
            <div className={styles.checkbox}>
              <CheckIcon />
            </div>
          )}
          {label}
        </label>
        {suffix && <span>{suffix}</span>}
      </Field>
    );
  }
);

export function ErrorMessage({ children }) {
  return <p className={styles.errorMessage}>{children}</p>;
}
