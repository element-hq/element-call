/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactElement, type ReactNode } from "react";
import { Popover as BUIPopover } from "@base-ui/react/popover";

import styles from "./Popover.module.css";
import { Heading } from "@vector-im/compound-web";
import classNames from "classnames";

export interface PopoverProps {
  /**
   * The popover title.
   */
  title: string;
  /**
   * The button that opens the popover. This must be a component that accepts a
   * ref and spreads props.
   *
   * https://base-ui.com/react/handbook/composition
   */
  trigger: ReactElement;
  /**
   * Whether the popover is open.
   */
  open: boolean;
  /**
   * Event handler called when the user tries to open or close the popover.
   */
  onOpenChange: (open: boolean) => void;
  /**
   * The popover contents.
   */
  children: ReactNode;
  className?: string;
  /**
   * The side of the trigger on which to place the popover. Note that the menu
   * may still end up on a different side than the one you request if there
   * isn't enough space.
   * @default bottom
   */
  side?: "top" | "bottom" | "left" | "right" | "inline-end" | "inline-start";
  /**
   * The edge along which the popover and trigger will be aligned.
   * @default center
   */
  align?: "start" | "center" | "end";
}

/**
 * A popover opened by pressing a button.
 */
export const Popover: FC<PopoverProps> = ({
  title,
  trigger,
  open,
  onOpenChange,
  children,
  className,
  side,
  align,
}) => {
  return (
    <BUIPopover.Root open={open} onOpenChange={onOpenChange}>
      <BUIPopover.Trigger render={trigger} />
      <BUIPopover.Portal>
        <BUIPopover.Positioner sideOffset={8} side={side} align={align}>
          <BUIPopover.Popup className={classNames(styles.popover, className)}>
            <BUIPopover.Title
              className={styles.title}
              render={
                <Heading as="h3" type="body" weight="semibold" size="lg">
                  {title}
                </Heading>
              }
            />
            {children}
          </BUIPopover.Popup>
        </BUIPopover.Positioner>
      </BUIPopover.Portal>
    </BUIPopover.Root>
  );
};
