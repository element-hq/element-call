import React, { forwardRef, useRef } from "react";
import { DismissButton, useOverlay } from "@react-aria/overlays";
import { FocusScope } from "@react-aria/focus";
import classNames from "classnames";
import styles from "./Popover.module.css";
import { useObjectRef } from "@react-aria/utils";

export const Popover = forwardRef(
  ({ isOpen = true, onClose, className, children, ...rest }, ref) => {
    const popoverRef = useObjectRef(ref);

    const { overlayProps } = useOverlay(
      {
        isOpen,
        onClose,
        shouldCloseOnBlur: true,
        isDismissable: true,
      },
      popoverRef
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
  }
);
