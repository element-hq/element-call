/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { forwardRef } from "react";
import classNames from "classnames";
import styles from "./Input.module.css";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";

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
  (
    {
      id,
      label,
      className,
      type,
      checked,
      prefix,
      suffix,
      description,
      disabled,
      ...rest
    },
    ref
  ) => {
    return (
      <Field
        className={classNames(
          type === "checkbox" ? styles.checkboxField : styles.inputField,
          {
            [styles.prefix]: !!prefix,
            [styles.disabled]: disabled,
          },
          className
        )}
      >
        {prefix && <span>{prefix}</span>}
        {type === "textarea" ? (
          <textarea
            id={id}
            {...rest}
            ref={ref}
            type={type}
            disabled={disabled}
          />
        ) : (
          <input
            id={id}
            {...rest}
            ref={ref}
            type={type}
            checked={checked}
            disabled={disabled}
          />
        )}

        <label htmlFor={id}>
          {type === "checkbox" && (
            <div className={styles.checkbox}>
              <CheckIcon />
            </div>
          )}
          {label}
        </label>
        {suffix && <span>{suffix}</span>}
        {description && <p className={styles.description}>{description}</p>}
      </Field>
    );
  }
);

export function ErrorMessage({ children }) {
  return <p className={styles.errorMessage}>{children}</p>;
}
