/*
Copyright 2022 Hugo Hutri <hugo.hutri98@gmail.com>

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

import styles from "./InputSlider.module.css";
import { FieldRow } from "../input/Input";

interface InputSliderProps {
  children: ReactNode;
  className?: string;
}

export function Field({ children, className }: InputSliderProps): JSX.Element {
  return <div className={classNames(styles.field, className)}>{children}</div>;
}

interface InputSliderProps {
  label: string;
  children:  ReactNode;
  description: string;
}

export const InputSlider = forwardRef<
  HTMLElement,
  InputSliderProps
>(
  (
    {
      label,
      children,
      description
    }
  ) => {
    return (
      <div>
        <label className={styles.label}>{label}</label>
        <FieldRow className={styles.button} children={children} />
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
