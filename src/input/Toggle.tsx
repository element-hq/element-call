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

import React, { useCallback, useRef } from "react";
import { useToggleButton } from "@react-aria/button";
import classNames from "classnames";

import styles from "./Toggle.module.css";
import { Field } from "./Input";

interface Props {
  id: string;
  label: string;
  className: string;
  onChange: (selected: boolean) => void;
  isSelected: boolean;
}

export function Toggle({ id, label, className, onChange, isSelected }: Props) {
  const buttonRef = useRef<HTMLButtonElement>();
  const toggle = useCallback(() => {
    onChange(!isSelected);
  }, [isSelected, onChange]);

  const buttonProps = useToggleButton(
    { isSelected },
    { isSelected: isSelected, setSelected: undefined, toggle },
    buttonRef
  );
  return (
    <Field
      className={classNames(
        styles.toggle,
        { [styles.on]: isSelected },
        className
      )}
    >
      <button
        {...buttonProps}
        ref={buttonRef}
        id={id}
        className={classNames(styles.button, {
          [styles.isPressed]: isSelected,
        })}
      >
        <div className={styles.ball} />
      </button>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
    </Field>
  );
}
