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

import { useRef } from "react";
import { AriaSelectOptions, HiddenSelect, useSelect } from "@react-aria/select";
import { useButton } from "@react-aria/button";
import { useSelectState } from "@react-stately/select";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { Popover } from "../popover/Popover";
import { ListBox } from "../ListBox";
import styles from "./SelectInput.module.css";
import ArrowDownIcon from "../icons/ArrowDown.svg?react";

interface Props extends AriaSelectOptions<object> {
  className?: string;
}

export function SelectInput(props: Props): JSX.Element {
  const { t } = useTranslation();
  const state = useSelectState(props);

  const ref = useRef(null);
  const { labelProps, triggerProps, valueProps, menuProps } = useSelect(
    props,
    state,
    ref,
  );

  const { buttonProps } = useButton(triggerProps, ref);

  return (
    <div className={classNames(styles.selectInput, props.className)}>
      <h4 {...labelProps} className={styles.label}>
        {props.label}
      </h4>
      <HiddenSelect
        state={state}
        triggerRef={ref}
        label={props.label}
        name={props.name}
      />
      <button {...buttonProps} ref={ref} className={styles.selectTrigger}>
        <span {...valueProps} className={styles.selectedItem}>
          {state.selectedItem
            ? state.selectedItem.rendered
            : t("Select an option")}
        </span>
        <ArrowDownIcon />
      </button>
      {state.isOpen && (
        <Popover
          isOpen={state.isOpen}
          onClose={state.close}
          className={styles.popover}
        >
          <ListBox
            {...menuProps}
            state={state}
            optionClassName={styles.option}
          />
        </Popover>
      )}
    </div>
  );
}
