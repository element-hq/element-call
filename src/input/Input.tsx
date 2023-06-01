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

import React, { ChangeEvent, FC, forwardRef, ReactNode, useId } from "react";
import classNames from "classnames";

import styles from "./Input.module.css";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import { TranslatedError } from "../TranslatedError";

interface FieldRowProps {
  children: ReactNode;
  rightAlign?: boolean;
  className?: string;
}

export function FieldRow({
  children,
  rightAlign,
  className,
}: FieldRowProps): JSX.Element {
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

interface FieldProps {
  children: ReactNode;
  className?: string;
}

export function Field({ children, className }: FieldProps): JSX.Element {
  return <div className={classNames(styles.field, className)}>{children}</div>;
}

interface InputFieldProps {
  label?: string;
  type: string;
  prefix?: string;
  suffix?: string;
  id?: string;
  checked?: boolean;
  className?: string;
  description?: string | ReactNode;
  disabled?: boolean;
  required?: boolean;
  // this is a hack. Those variables should be part of `HTMLAttributes<HTMLInputElement> | HTMLAttributes<HTMLTextAreaElement>`
  // but extending from this union type does not work
  name?: string;
  autoComplete?: string;
  autoCorrect?: string;
  autoCapitalize?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  defaultChecked?: boolean;
  onChange?: (event: ChangeEvent) => void;
}

export const InputField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputFieldProps
>(
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
    const descriptionId = useId();

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
            ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
            disabled={disabled}
            aria-describedby={descriptionId}
            {...rest}
          />
        ) : (
          <input
            id={id}
            ref={ref as React.ForwardedRef<HTMLInputElement>}
            type={type}
            checked={checked}
            disabled={disabled}
            aria-describedby={descriptionId}
            {...rest}
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
        {description && (
          <p
            id={descriptionId}
            className={
              label
                ? styles.description
                : classNames(styles.description, styles.noLabel)
            }
          >
            {description}
          </p>
        )}
      </Field>
    );
  }
);

interface ErrorMessageProps {
  error: Error;
}

export const ErrorMessage: FC<ErrorMessageProps> = ({ error }) => (
  <p className={styles.errorMessage}>
    {error instanceof TranslatedError ? error.translatedMessage : error.message}
  </p>
);
