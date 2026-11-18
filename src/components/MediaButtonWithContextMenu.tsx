/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { Button, Menu } from "@vector-im/compound-web";
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import styles from "./MediaButtonWithContextMenu.module.css";
import { useMediaDevices } from "../MediaDevicesContext";
import { useRootElement } from "../RootElementContext";

/** The menu's width as its stylesheet sets it. */
export const MENU_WIDTH = 296;

/** Space kept between the menu and the call area's sides. */
export const MENU_MARGIN = 16;

const HoldOpenContext = createContext<(held: boolean) => void>(() => {});

/**
 * Keeps the menu open while held, though focus leaves it: a file picker takes
 * the focus, which the menu reads as a click elsewhere.
 */
export function useHoldMenuOpen(): (held: boolean) => void {
  return useContext(HoldOpenContext);
}

interface Props {
  /** Drawn as it is, before the chevron. */
  muteButton: ReactNode;
  /** The chevron's label. */
  label: string;
  /** Names the menu for screen readers. */
  title: string;
  onOpenChange?: (open: boolean) => void;
  /** The menu's content, drawn only while it is open. */
  children: ReactNode;
}

/** A mute button with a chevron beside it that opens a menu. */
export const MediaButtonWithContextMenu: FC<Props> = ({
  muteButton,
  label,
  title,
  onOpenChange,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const held = useRef(false);
  const hold = useCallback((h: boolean): void => {
    held.current = h;
  }, []);
  const changeOpen = useCallback(
    (next: boolean): void => {
      if (!next && held.current) return;
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const devices = useMediaDevices();
  useEffect(() => {
    if (open) devices.requestDeviceNames(); // No-op after the first call
  }, [open, devices]);

  const rootElement = useRootElement();
  return (
    <div
      className={classNames(styles.container, {
        [styles.containerOpen]: open,
      })}
    >
      {muteButton}
      <Menu
        className={styles.menu}
        // Named for screen readers only: each section has its own heading.
        title={title}
        showTitle={false}
        open={open}
        onOpenChange={changeOpen}
        side="top"
        collisionBoundary={rootElement}
        collisionPadding={MENU_MARGIN}
        trigger={
          <Button
            iconOnly
            className={classNames(styles.menuButton, {
              [styles.chevronIconOpen]: open,
            })}
            Icon={open ? ChevronUpIcon : ChevronDownIcon}
            kind="tertiary"
            size="lg"
            aria-label={label}
          />
        }
      >
        <HoldOpenContext value={hold}>{children}</HoldOpenContext>
      </Menu>
    </div>
  );
};
