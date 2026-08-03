/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import {
  type FC,
  type Ref,
  type FormEventHandler,
  type ReactNode,
} from "react";

import styles from "./Form.module.css";

interface FormProps {
  ref?: Ref<HTMLFormElement>;
  className: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode[];
}

export const Form: FC<FormProps> = ({ ref, children, className, onSubmit }) => {
  return (
    <form
      onSubmit={onSubmit}
      className={classNames(styles.form, className)}
      ref={ref}
    >
      {children}
    </form>
  );
};

Form.displayName = "Form";
