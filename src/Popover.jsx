import React, { forwardRef } from "react";
import {
  DismissButton,
  useOverlay,
  OverlayContainer,
} from "@react-aria/overlays";
import { FocusScope } from "@react-aria/focus";
import classNames from "classnames";
import styles from "./Popover.module.css";

export const Popover = forwardRef(
  ({ isOpen = true, onClose, className, children, ...rest }, ref) => {
    const { overlayProps } = useOverlay(
      {
        isOpen,
        onClose,
        shouldCloseOnBlur: true,
        isDismissable: true,
      },
      ref
    );

    return (
      <OverlayContainer>
        <FocusScope restoreFocus>
          <div
            {...overlayProps}
            {...rest}
            className={classNames(styles.popover, className)}
            ref={ref}
          >
            {children}
            <DismissButton onDismiss={onClose} />
          </div>
        </FocusScope>
      </OverlayContainer>
    );
  }
);
