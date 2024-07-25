/*
Copyright 2023 New Vector Ltd

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

import { FC, ReactNode, useCallback } from "react";
import { AriaDialogProps } from "@react-types/dialog";
import { useTranslation } from "react-i18next";
import {
  Root as DialogRoot,
  Portal as DialogPortal,
  Overlay as DialogOverlay,
  Content as DialogContent,
  Title as DialogTitle,
  Close as DialogClose,
} from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { CloseIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { Heading, Glass } from "@vector-im/compound-web";

import styles from "./Modal.module.css";
import overlayStyles from "./Overlay.module.css";
import { useMediaQuery } from "./useMediaQuery";

// TODO: Support tabs
export interface Props extends AriaDialogProps {
  title: string;
  children: ReactNode;
  className?: string;
  /**
   * The controlled open state of the modal.
   */
  // An option to leave the open state uncontrolled is intentionally not
  // provided, since modals are always opened due to external triggers, and it
  // is the author's belief that controlled components lead to more obvious code.
  open: boolean;
  /**
   * Callback for when the user dismisses the modal. If undefined, the modal
   * will be non-dismissable.
   */
  onDismiss?: () => void;
}

/**
 * A modal, taking the form of a drawer / bottom sheet on touchscreen devices,
 * and a dialog box on desktop.
 */
export const Modal: FC<Props> = ({
  title,
  children,
  className,
  open,
  onDismiss,
  ...rest
}) => {
  const { t } = useTranslation();
  // Empirically, Chrome on Android can end up not matching (hover: none), but
  // still matching (pointer: coarse) :/
  const touchscreen = useMediaQuery("(hover: none) or (pointer: coarse)");
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onDismiss?.();
    },
    [onDismiss],
  );

  if (touchscreen) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        dismissible={onDismiss !== undefined}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={classNames(overlayStyles.bg)} />
          <Drawer.Content
            className={classNames(
              className,
              overlayStyles.overlay,
              styles.modal,
              styles.drawer,
            )}
            {...rest}
          >
            <div className={styles.content}>
              <div className={styles.header}>
                <div className={styles.handle} />
                <VisuallyHidden asChild>
                  <Drawer.Title>{title}</Drawer.Title>
                </VisuallyHidden>
              </div>
              <div className={styles.body}>{children}</div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  } else {
    return (
      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay
            className={classNames(overlayStyles.bg, overlayStyles.animate)}
          />
          <DialogContent asChild {...rest}>
            <Glass
              className={classNames(
                className,
                overlayStyles.overlay,
                overlayStyles.animate,
                styles.modal,
                styles.dialog,
              )}
            >
              <div className={styles.content}>
                <div className={styles.header}>
                  <DialogTitle asChild>
                    <Heading as="h2" weight="semibold" size="md">
                      {title}
                    </Heading>
                  </DialogTitle>
                  {onDismiss !== undefined && (
                    <DialogClose
                      className={styles.close}
                      data-testid="modal_close"
                      aria-label={t("action.close")}
                    >
                      <CloseIcon width={20} height={20} />
                    </DialogClose>
                  )}
                </div>
                <div className={styles.body}>{children}</div>
              </div>
            </Glass>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    );
  }
};
