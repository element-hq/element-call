import React, { useRef } from "react";
import { HiddenSelect, useSelect } from "@react-aria/select";
import { useButton } from "@react-aria/button";
import { useSelectState } from "@react-stately/select";
import { Popover } from "./Popover";
import { ListBox } from "./ListBox";
import { useOverlayPosition } from "@react-aria/overlays";
import styles from "./SelectInput.module.css";
import classNames from "classnames";
import { ReactComponent as ArrowDownIcon } from "./icons/ArrowDown.svg";

export function SelectInput(props) {
  const state = useSelectState(props);

  const ref = useRef();
  const { labelProps, triggerProps, valueProps, menuProps } = useSelect(
    props,
    state,
    ref
  );

  const { buttonProps } = useButton(triggerProps, ref);

  const popoverRef = useRef();

  const { overlayProps } = useOverlayPosition({
    targetRef: ref,
    overlayRef: popoverRef,
    placement: "bottom left",
    offset: 5,
    isOpen: state.isOpen,
  });

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
            : "Select an option"}
        </span>
        <ArrowDownIcon />
      </button>
      {state.isOpen && (
        <Popover
          ref={popoverRef}
          isOpen={state.isOpen}
          onClose={state.close}
          className={styles.popover}
          {...overlayProps}
        >
          <ListBox
            {...menuProps}
            className
            state={state}
            optionClassName={styles.option}
          />
        </Popover>
      )}
    </div>
  );
}
