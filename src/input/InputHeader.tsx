/*
Copyright 2021 Hugo Hutri <hugo.hutri98@gmail.com>

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

import React, { forwardRef, ReactNode } from "react";
import classNames from "classnames";

import styles from "./InputHeader.module.css";
import { FieldRow } from "../input/Input";

interface HeaderProps {
  children: ReactNode;
  className?: string;
}

export function Field({ children, className }: HeaderProps): JSX.Element {
  return <div className={classNames(styles.field, className)}>{children}</div>;
}

interface InputHeaderProps {
  label: string;
  child:  ReactNode;
  description: string;
}

export const InputHeader = forwardRef<
  HTMLElement,
  InputHeaderProps
>(
  (
    {
      label,
      child,
      description
    }
  ) => {
    return (
      <div>
        <label className={styles.label}>{label}</label>
        <FieldRow className={styles.button} children={child} />
        {description && <p className={styles.description}>{description}</p>}
      </div>
    );
  }
);

export function ErrorMessage({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <p className={styles.errorMessage}>{children}</p>;
}
