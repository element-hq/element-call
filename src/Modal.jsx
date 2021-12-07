import React, { useRef, useMemo } from "react";
import {
  useOverlay,
  usePreventScroll,
  useModal,
  OverlayContainer,
} from "@react-aria/overlays";
import { useOverlayTriggerState } from "@react-stately/overlays";
import { useDialog } from "@react-aria/dialog";
import { FocusScope } from "@react-aria/focus";
import { useButton } from "@react-aria/button";
import { ReactComponent as CloseIcon } from "./icons/Close.svg";
import styles from "./Modal.module.css";
import classNames from "classnames";

export function Modal(props) {
  const { title, children, className } = props;
  const modalRef = useRef();
  const { overlayProps, underlayProps } = useOverlay(props, modalRef);
  usePreventScroll();
  const { modalProps } = useModal();
  const { dialogProps, titleProps } = useDialog(props, modalRef);
  const closeButtonRef = useRef();
  const { buttonProps: closeButtonProps } = useButton({
    onPress: () => props.onClose(),
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
            className={classNames(styles.modal, className)}
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

export function useModalTriggerState() {
  const modalState = useOverlayTriggerState({});
  const modalProps = useMemo(
    () => ({ isOpen: modalState.isOpen, onClose: modalState.close }),
    [modalState]
  );
  return { modalState, modalProps };
}

export function useToggleModalButton(modalState, ref) {
  return useButton(
    {
      onPress: () => modalState.toggle(),
    },
    ref
  );
}

export function useOpenModalButton(modalState, ref) {
  return useButton(
    {
      onPress: () => modalState.open(),
    },
    ref
  );
}

export function useCloseModalButton(modalState, ref) {
  return useButton(
    {
      onPress: () => modalState.close(),
    },
    ref
  );
}

export function ModalTrigger({ children }) {
  const { modalState, modalProps } = useModalState();
  const buttonRef = useRef();
  const { buttonProps } = useToggleModalButton(modalState, buttonRef);

  if (
    !Array.isArray(children) ||
    children.length > 2 ||
    typeof children[1] !== "function"
  ) {
    throw new Error(
      "ModalTrigger must have two props. The first being a button and the second being a render prop."
    );
  }

  const [modalTrigger, modal] = children;

  return (
    <>
      <modalTrigger.type
        {...modalTrigger.props}
        {...buttonProps}
        ref={buttonRef}
      />
      {modalState.isOpen && modal(modalProps)}
    </>
  );
}
