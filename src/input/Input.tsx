/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ChangeEvent,
  type FC,
  type ForwardedRef,
  type ReactNode,
  useId,
  type JSX,
  type Ref,
} from "react";
import classNames from "classnames";

import styles from "./Input.module.css";
import CheckIcon from "../icons/Check.svg?react";
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
        className,
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

function Field({ children, className }: FieldProps): JSX.Element {
  return <div className={classNames(styles.field, className)}>{children}</div>;
}

interface InputFieldProps {
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>;
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
  min?: number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const InputField: FC<InputFieldProps> = ({
  ref,
  id,
  label,
  className,
  type,
  checked,
  prefix,
  suffix,
  description,
  disabled,
  min,
  ...rest
}) => {
  const descriptionId = useId();

  return (
    <Field
      className={classNames(
        type === "checkbox" ? styles.checkboxField : styles.inputField,
        {
          [styles.prefix]: !!prefix,
          [styles.disabled]: disabled,
        },
        className,
      )}
    >
      {prefix && <span>{prefix}</span>}
      {type === "textarea" ? (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        <textarea
          id={id}
          ref={ref as ForwardedRef<HTMLTextAreaElement>}
          disabled={disabled}
          aria-describedby={descriptionId}
          {...rest}
        />
      ) : (
        <input
          id={id}
          ref={ref as ForwardedRef<HTMLInputElement>}
          type={type}
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          min={min}
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
};

InputField.displayName = "InputField";

interface ErrorMessageProps {
  error: Error;
}

export const ErrorMessage: FC<ErrorMessageProps> = ({ error }) => (
  <p className={styles.errorMessage}>
    {error instanceof TranslatedError ? error.translatedMessage : error.message}
  </p>
);
