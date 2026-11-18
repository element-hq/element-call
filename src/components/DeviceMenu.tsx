/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import {
  MenuItem,
  MenuScrollArea,
  MenuScrollSection,
  RadioInput,
} from "@vector-im/compound-web";
import { SpinnerIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { distinctUntilChanged, map } from "rxjs";

import styles from "./DeviceMenu.module.css";
import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
} from "../state/MediaDevices";
import { useRootElement } from "../RootElementContext";
import { type ElementSize, observeElementSize$ } from "../utils/elementSize";
import { MENU_MARGIN, MENU_WIDTH } from "./MediaButtonWithContextMenu";

export interface MenuOptions {
  label: DeviceLabel | AudioOutputDeviceLabel;
  id: string;
}

/** Largest share of the call area's height the device list may take. */
const LIST_SHARE_OF_CALL = 0.6;

/** Smallest device list height in px, so a short call still shows more than one device. */
export const MIN_LIST_HEIGHT = 160;

interface CallAreaShare {
  listHeight: number;
  menuWidth: number;
}

function shareOf({ width, height }: ElementSize): CallAreaShare {
  return {
    listHeight: Math.round(height * LIST_SHARE_OF_CALL),
    menuWidth: Math.min(MENU_WIDTH, Math.round(width - 2 * MENU_MARGIN)),
  };
}

/**
 * The height the device list may take and the width the menu gets, from the
 * call area: CSS can't size the portalled menu against it.
 */
export function useCallAreaShare(): CallAreaShare {
  const rootElement = useRootElement();
  // Measured as the menu is first drawn, so what scrolls into view as it
  // appears does so in a list of its final height.
  const [share, setShare] = useState(() =>
    shareOf({
      width: rootElement.clientWidth,
      height: rootElement.clientHeight,
    }),
  );
  useEffect(() => {
    // Followed, since a host can resize the call while the menu is open.
    const subscription = observeElementSize$(rootElement)
      .pipe(
        map(shareOf),
        distinctUntilChanged(
          (a, b) =>
            a.listHeight === b.listHeight && a.menuWidth === b.menuWidth,
        ),
      )
      .subscribe(setShare);
    return (): void => subscription.unsubscribe();
  }, [rootElement]);
  return share;
}

/**
 * The device last asked for, until it is selected. Nothing can be picked
 * while it is on offer but not yet selected, so a second request can't
 * overtake it. Keyed by list too, since Chrome uses "default" for both an
 * input and an output. Held as long as the menu is open.
 */
export function usePlannedSelection<List extends string>(
  lists: Record<List, { options: MenuOptions[]; selected: string | undefined }>,
): {
  requested: (list: List) => string | undefined;
  plan: (list: List, id: string) => void;
  settling: boolean;
} {
  const [planned, setPlanned] = useState<{ list: List; id: string } | null>(
    null,
  );
  const plannedList = planned && lists[planned.list];
  const settling =
    planned !== null &&
    planned.id !== plannedList?.selected &&
    plannedList?.options.some(({ id }) => id === planned.id) === true;
  return {
    requested: (list) => (planned?.list === list ? planned.id : undefined),
    plan: (list, id) => setPlanned({ list, id }),
    settling,
  };
}

interface DeviceMenuListProps {
  maxHeight: number;
  className?: string;
  children: ReactNode;
}

/** The scrolling part of a device menu, holding its sections. */
export const DeviceMenuList: FC<DeviceMenuListProps> = ({
  maxHeight,
  className,
  children,
}) => {
  /**
   * Records on the menu whether the keyboard or the pointer moved focus, for
   * the focus ring. `:focus-visible` can't tell: Radix focuses whatever the
   * pointer is over. Listened for on the menu, not the document, so a second
   * Element Call on the page doesn't answer for this one.
   */
  const trackFocusSource = useCallback(
    (list: HTMLDivElement | null): (() => void) | undefined => {
      const menu = list?.closest<HTMLElement>('[role="menu"]');
      if (menu === null || menu === undefined) return;
      const record = (source: "keyboard" | "pointer"): void => {
        menu.dataset.focusSource = source;
      };
      record("pointer");
      const usedKeyboard = (): void => record("keyboard");
      const usedPointer = (): void => record("pointer");
      menu.addEventListener("keydown", usedKeyboard, true);
      menu.addEventListener("pointermove", usedPointer, true);
      return (): void => {
        menu.removeEventListener("keydown", usedKeyboard, true);
        menu.removeEventListener("pointermove", usedPointer, true);
      };
    },
    [],
  );

  return (
    <MenuScrollArea
      ref={trackFocusSource}
      className={classNames(styles.deviceList, className)}
      data-testid="device-list"
      style={
        {
          "--device-list-max-height": `${maxHeight}px`,
        } as CSSProperties
      }
    >
      {children}
    </MenuScrollArea>
  );
};

interface DeviceMenuSectionProps {
  title: string;
  options: MenuOptions[];
  selected: string | undefined;
  /** Undefined disables the rows. */
  onSelect: ((id: string) => void) | undefined;
  /** Names a device known only by its number. */
  numbered: (n: number) => string;
  /** The device asked for and not yet selected, marked as activating. */
  requested: string | undefined;
  /** Disables the rows while a request anywhere in the menu is outstanding. */
  locked: boolean;
  stickyBottomItem?: ReactNode;
}

/** One list of devices to pick from, as radio rows. */
export const DeviceMenuSection: FC<DeviceMenuSectionProps> = ({
  title,
  options,
  selected,
  onSelect,
  numbered,
  requested,
  locked,
  stickyBottomItem,
}) => {
  const { t } = useTranslation();
  const labelText = (label: MenuOptions["label"]): string => {
    switch (label.type) {
      case "name":
        return label.name;
      case "number":
        return numbered(label.number);
      case "default":
        return label.name === null
          ? t("settings.devices.default")
          : t("settings.devices.default_named_plain", { name: label.name });
      case "speaker":
        return t("settings.devices.loudspeaker");
      case "earpiece":
        return t("settings.devices.handset");
    }
  };

  // Disabled rather than hidden, so the menu keeps its shape.
  const disabled = onSelect === undefined || options.length <= 1 || locked;
  return (
    <MenuScrollSection title={title} stickyBottomItem={stickyBottomItem}>
      {options.map(({ label, id }) => (
        <MenuItem
          // A radio input may not sit inside a button.
          as="div"
          hideChevron
          disabled={disabled}
          label={labelText(label)}
          Icon={
            // Inert, not aria-hidden: aria-hidden alone leaves it focusable.
            <span inert>
              <RadioInput
                checked={selected === id}
                disabled={disabled}
                // Not readOnly, which mutes the selected fill. The item handles
                // the click.
                onChange={(): void => {}}
              />
            </span>
          }
          onSelect={(e) => {
            e.preventDefault();
            if (id === selected) return;
            onSelect?.(id);
          }}
          key={id}
          role="menuitemradio"
          aria-checked={selected === id}
        >
          {selected !== id && requested === id && (
            <SpinnerIcon
              width={24}
              height={24}
              className={styles.rotate}
              aria-label={t("settings.devices.activating")}
            />
          )}
        </MenuItem>
      ))}
    </MenuScrollSection>
  );
};
