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

import classNames from "classnames";
import React, { FormEventHandler, forwardRef, ReactNode } from "react";

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
  }
);
