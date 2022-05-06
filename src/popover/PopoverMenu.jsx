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

import React, { forwardRef, useRef } from "react";
import styles from "./PopoverMenu.module.css";
import { useMenuTriggerState } from "@react-stately/menu";
import { useMenuTrigger } from "@react-aria/menu";
import { OverlayContainer, useOverlayPosition } from "@react-aria/overlays";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import classNames from "classnames";
import { Popover } from "./Popover";

export const PopoverMenuTrigger = forwardRef(
  ({ children, placement, className, disableOnState, ...rest }, ref) => {
    const popoverMenuState = useMenuTriggerState(rest);
    const buttonRef = useObjectRef(ref);
    const { menuTriggerProps, menuProps } = useMenuTrigger(
      {},
      popoverMenuState,
      buttonRef
    );

    const popoverRef = useRef();

    const { overlayProps } = useOverlayPosition({
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

    const [popoverTrigger, popoverMenu] = children;

    return (
      <div className={classNames(styles.popoverMenuTrigger, className)}>
        <popoverTrigger.type
          {...mergeProps(popoverTrigger.props, menuTriggerProps)}
          on={!disableOnState && popoverMenuState.isOpen}
          ref={buttonRef}
        />
        {popoverMenuState.isOpen && (
          <OverlayContainer>
            <Popover
              {...overlayProps}
              isOpen={popoverMenuState.isOpen}
              onClose={popoverMenuState.close}
              ref={popoverRef}
            >
              {popoverMenu({
                ...menuProps,
                autoFocus: popoverMenuState.focusStrategy,
                onClose: popoverMenuState.close,
              })}
            </Popover>
          </OverlayContainer>
        )}
      </div>
    );
  }
);
