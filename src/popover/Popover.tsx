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

import { forwardRef, HTMLAttributes } from "react";
import { DismissButton, useOverlay } from "@react-aria/overlays";
import { FocusScope } from "@react-aria/focus";
import classNames from "classnames";
import { useObjectRef } from "@react-aria/utils";

import styles from "./Popover.module.css";

interface Props extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children?: JSX.Element;
}

export const Popover = forwardRef<HTMLDivElement, Props>(
  ({ isOpen = true, onClose, className, children, ...rest }, ref) => {
    const popoverRef = useObjectRef(ref);

    const { overlayProps } = useOverlay(
      {
        isOpen,
        onClose,
        shouldCloseOnBlur: true,
        isDismissable: true,
      },
      popoverRef,
    );

    return (
      <FocusScope restoreFocus>
        <div
          {...overlayProps}
          {...rest}
          className={classNames(styles.popover, className)}
          ref={popoverRef}
        >
          {children}
          <DismissButton onDismiss={onClose} />
        </div>
      </FocusScope>
    );
  },
);

Popover.displayName = "Popover";
