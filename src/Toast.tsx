/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  ComponentType,
  FC,
  SVGAttributes,
  useCallback,
  useEffect,
} from "react";
import {
  Root as DialogRoot,
  Portal as DialogPortal,
  Overlay as DialogOverlay,
  Content as DialogContent,
  Close as DialogClose,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import classNames from "classnames";
import { Text } from "@vector-im/compound-web";

import styles from "./Toast.module.css";
import overlayStyles from "./Overlay.module.css";

interface Props {
  /**
   * The controlled open state of the toast.
   */
  open: boolean;
  /**
   * Callback for when the user dismisses the toast.
   */
  onDismiss: () => void;
  /**
   * A number of milliseconds after which the toast should be automatically
   * dismissed.
   */
  autoDismiss?: number;
  children: string;
  /**
   * A supporting icon to display within the toast.
   */
  Icon?: ComponentType<SVGAttributes<SVGElement>>;
}

/**
 * A temporary message shown in an overlay in the center of the screen.
 */
export const Toast: FC<Props> = ({
  open,
  onDismiss,
  autoDismiss,
  children,
  Icon,
}) => {
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (open && autoDismiss !== undefined) {
      const timeout = setTimeout(onDismiss, autoDismiss);
      return (): void => clearTimeout(timeout);
    }
  }, [open, autoDismiss, onDismiss]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay
          className={classNames(overlayStyles.bg, overlayStyles.animate)}
        />
        <DialogContent aria-describedby={undefined} asChild>
          <DialogClose
            className={classNames(
              overlayStyles.overlay,
              overlayStyles.animate,
              styles.toast,
            )}
          >
            <DialogTitle asChild>
              <Text as="h3" size="sm" weight="semibold">
                {children}
              </Text>
            </DialogTitle>
            {Icon && <Icon width={20} height={20} aria-hidden />}
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};
