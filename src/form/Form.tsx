/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import { FormEventHandler, forwardRef, ReactNode } from "react";

import styles from "./Form.module.css";

interface FormProps {
  className: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode[];
}

export const Form = forwardRef<HTMLFormElement, FormProps>(
  ({ children, className, onSubmit }, ref) => {
    return (
      <form
        onSubmit={onSubmit}
        className={classNames(styles.form, className)}
        ref={ref}
      >
        {children}
      </form>
    );
  },
);

Form.displayName = "Form";
