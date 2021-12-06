import React, { useRef, useState, forwardRef } from "react";
import styles from "./PopoverMenu.module.css";
import { useMenuTriggerState } from "@react-stately/menu";
import { useButton } from "@react-aria/button";
import { useMenu, useMenuItem, useMenuTrigger } from "@react-aria/menu";
import { useTreeState } from "@react-stately/tree";
import { Item } from "@react-stately/collections";
import { mergeProps } from "@react-aria/utils";
import { FocusScope } from "@react-aria/focus";
import { useFocus } from "@react-aria/interactions";
import {
  useOverlay,
  DismissButton,
  useOverlayPosition,
  OverlayContainer,
} from "@react-aria/overlays";
import classNames from "classnames";

export function PopoverMenu({ children, placement, ...rest }) {
  const popoverMenuState = useMenuTriggerState(rest);
  const buttonRef = useRef();
  const { menuTriggerProps, menuProps } = useMenuTrigger(
    {},
    popoverMenuState,
    buttonRef
  );

  const popoverRef = useRef();

  const { overlayProps: positionProps } = useOverlayPosition({
    targetRef: buttonRef,
    overlayRef: popoverRef,
    placement: placement || "top",
    offset: 5,
    isOpen: popoverMenuState.isOpen,
  });

  if (
    !Array.isArray(children) ||
    children.length > 2 ||
    typeof children[1] !== "function"
  ) {
    throw new Error(
      "PopoverMenu must have two props. The first being a button and the second being a render prop."
    );
  }

  const [popoverTrigger, popover] = children;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <popoverTrigger.type
        {...popoverTrigger.props}
        {...menuTriggerProps}
        on={popoverMenuState.isOpen}
        ref={buttonRef}
      />
      {popoverMenuState.isOpen &&
        popover({
          isOpen: popoverMenuState.isOpen,
          onClose: popoverMenuState.close,
          autoFocus: popoverMenuState.focusStrategy,
          domProps: menuProps,
          ref: popoverRef,
          positionProps,
          ...rest,
        })}
    </div>
  );
}

export const Popover = forwardRef((props, ref) => {
  const state = useTreeState({ ...props, selectionMode: "none" });
  const menuRef = useRef();
  const { menuProps } = useMenu(props, state, menuRef);
  const { overlayProps } = useOverlay(
    {
      onClose: props.onClose,
      shouldCloseOnBlur: true,
      isOpen: true,
      isDismissable: true,
    },
    ref
  );

  return (
    <OverlayContainer>
      <FocusScope restoreFocus>
        <div
          className={styles.popover}
          {...mergeProps(overlayProps, props.positionProps)}
          ref={ref}
        >
          <DismissButton onDismiss={props.onClose} />
          <ul
            {...mergeProps(menuProps, props.domProps)}
            ref={menuRef}
            className={styles.popoverMenu}
          >
            {[...state.collection].map((item) => (
              <PopoverMenuItemContainer
                key={item.key}
                item={item}
                state={state}
                onAction={props.onAction}
                onClose={props.onClose}
              />
            ))}
          </ul>
          <DismissButton onDismiss={props.onClose} />
        </div>
      </FocusScope>
    </OverlayContainer>
  );
});

function PopoverMenuItemContainer({ item, state, onAction, onClose }) {
  const ref = useRef();
  const { menuItemProps } = useMenuItem(
    {
      key: item.key,
      isDisabled: item.isDisabled,
      onAction,
      onClose,
    },
    state,
    ref
  );

  const [isFocused, setFocused] = useState(false);
  const { focusProps } = useFocus({ onFocusChange: setFocused });

  return (
    <li
      {...mergeProps(menuItemProps, focusProps)}
      ref={ref}
      className={classNames(styles.popoverMenuItem, {
        [styles.focused]: isFocused,
      })}
    >
      {item.rendered}
    </li>
  );
}

export const PopoverMenuItem = Item;
