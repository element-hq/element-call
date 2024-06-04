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
        <DialogContent asChild>
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
