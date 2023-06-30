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

/* eslint-disable jsx-a11y/no-autofocus */

import { useRef, useMemo, ReactNode } from "react";
import {
  useOverlay,
  usePreventScroll,
  useModal,
  OverlayContainer,
  OverlayProps,
} from "@react-aria/overlays";
import {
  OverlayTriggerState,
  useOverlayTriggerState,
} from "@react-stately/overlays";
import { useDialog } from "@react-aria/dialog";
import { FocusScope } from "@react-aria/focus";
import { useButton } from "@react-aria/button";
import classNames from "classnames";
import { AriaDialogProps } from "@react-types/dialog";
import { useTranslation } from "react-i18next";

import { ReactComponent as CloseIcon } from "./icons/Close.svg";
import styles from "./Modal.module.css";

export interface ModalProps extends OverlayProps, AriaDialogProps {
  title: string;
  children: ReactNode;
  className?: string;
  mobileFullScreen?: boolean;
  onClose: () => void;
}

export function Modal({
  title,
  children,
  className,
  mobileFullScreen,
  onClose,
  ...rest
}: ModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef(null);
  const { overlayProps, underlayProps } = useOverlay(
    { ...rest, onClose },
    modalRef
  );
  usePreventScroll();
  const { modalProps } = useModal();
  const { dialogProps, titleProps } = useDialog(rest, modalRef);
  const closeButtonRef = useRef(null);
  const { buttonProps: closeButtonProps } = useButton(
    {
      onPress: () => onClose(),
    },
    closeButtonRef
  );

  return (
    <OverlayContainer>
      <div className={styles.modalOverlay} {...underlayProps}>
        <FocusScope contain restoreFocus autoFocus>
          <div
            {...overlayProps}
            {...dialogProps}
            {...modalProps}
            ref={modalRef}
            className={classNames(
              styles.modal,
              { [styles.mobileFullScreen]: mobileFullScreen },
              className
            )}
          >
            <div className={styles.modalHeader}>
              <h3 {...titleProps}>{title}</h3>
              <button
                {...closeButtonProps}
                ref={closeButtonRef}
                className={styles.closeButton}
                data-testid="modal_close"
                title={t("Close")}
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

interface ModalContentProps {
  children: ReactNode;
  className?: string;
}

export function ModalContent({
  children,
  className,
  ...rest
}: ModalContentProps) {
  return (
    <div className={classNames(styles.content, className)} {...rest}>
      {children}
    </div>
  );
}

export function useModalTriggerState(): {
  modalState: OverlayTriggerState;
  modalProps: { isOpen: boolean; onClose: () => void };
} {
  const modalState = useOverlayTriggerState({});
  const modalProps = useMemo(
    () => ({ isOpen: modalState.isOpen, onClose: modalState.close }),
    [modalState]
  );
  return { modalState, modalProps };
}
