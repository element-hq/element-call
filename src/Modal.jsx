import React, { useRef } from "react";
import {
  useOverlay,
  usePreventScroll,
  useModal,
  OverlayContainer,
} from "@react-aria/overlays";
import { useDialog } from "@react-aria/dialog";
import { FocusScope } from "@react-aria/focus";
import { useButton } from "@react-aria/button";
import { ReactComponent as CloseIcon } from "./icons/Close.svg";
import styles from "./Modal.module.css";
import classNames from "classnames";

export function Modal(props) {
  const { title, children } = props;
  const modalRef = useRef();
  const { overlayProps, underlayProps } = useOverlay(props, modalRef);
  usePreventScroll();
  const { modalProps } = useModal();
  const { dialogProps, titleProps } = useDialog(props, modalRef);
  const closeButtonRef = useRef();
  const { buttonProps: closeButtonProps } = useButton({
    onPress: () => props.close(),
  });

  return (
    <OverlayContainer>
      <div className={styles.modalOverlay} {...underlayProps}>
        <FocusScope contain restoreFocus autoFocus>
          <div
            {...overlayProps}
            {...dialogProps}
            {...modalProps}
            ref={modalRef}
            className={styles.modal}
          >
            <div className={styles.modalHeader}>
              <h3 {...titleProps}>{title}</h3>
              <button
                {...closeButtonProps}
                ref={closeButtonRef}
                className={styles.closeButton}
              >
                <CloseIcon />
              </button>
            </div>
            {children}
          </div>
        </FocusScope>
      </div>
    </OverlayContainer>
  );
}

export function ModalContent({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.content, className)} {...rest}>
      {children}
    </div>
  );
}
