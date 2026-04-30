/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentType, useState, type FC } from "react";
import {
  Button,
  Menu,
  MenuItem,
  ToggleMenuItem,
} from "@vector-im/compound-web";
import { t } from "i18next";
import {
  CheckIcon,
  ChevronUpIcon,
  SpinnerIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import styles from "./MediaMuteAndSwitchButton.module.css";
export interface MenuOptions {
  label: string;
  id: string;
}
export interface ToggleOption {
  label: string;
  enabled: boolean;
  id: string;
}

export interface MediaMuteAndSwitchButtonProps {
  /** The title used in the Switcher modal. */
  title: string;
  /** If the Mute button is enabled */
  enabled?: boolean;
  /** Callback if the mute button is clicked */
  onMuteClick?: () => void;
  /** The Icon used if the mute button is enabled */
  IconEnabled: ComponentType<React.SVGAttributes<SVGElement>>;
  /** The Icon used if the mute button is disabled */
  IconDisabled: ComponentType<React.SVGAttributes<SVGElement>>;
  /** The options available for the media device selector modal */
  options?: MenuOptions[];
  /** The option that will currently be rendered as the selected option */
  selectedOption?: string;
  /** The icon used for the different options */
  IconOptions?: ComponentType<React.SVGAttributes<SVGElement>>;
  /**
   * The available toggles (including there current state)
   * The toggle state is not stored by this component.
   * It is handled externally and needs to be set by listening to the `onSelect` callback and setting the right toggle item to `enabled`
   */
  toggles?: ToggleOption[];
  /**
   * For any toggle and option this method will be called.
   * So toggles need to be implemented by listening here and setting the right toggle item to `enabled`
   */
  onSelect?: (id: string) => void;
}

export const MediaMuteAndSwitchButton: FC<MediaMuteAndSwitchButtonProps> = ({
  title,
  enabled,
  onMuteClick,
  IconEnabled,
  IconDisabled,
  options,
  selectedOption,
  IconOptions,
  toggles,
  onSelect,
}) => {
  const [plannedSelection, setPlannedSelection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={classNames({
        [styles.container]: true,
        [styles.containerOpen]: menuOpen,
      })}
    >
      {/* The mute button lives inside */}
      <Button
        iconOnly
        Icon={enabled ? IconEnabled : IconDisabled}
        onClick={(e) => {
          onMuteClick?.();
          e.preventDefault();
          e.stopPropagation();
        }}
        kind={enabled ? "secondary" : "primary"}
        size="lg"
        className={styles.button}
        aria-label={t("action.edit")}
      />
      <Menu
        title={title}
        showTitle={true}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="top"
        trigger={
          <Button
            iconOnly
            className={styles.menuButton}
            Icon={ChevronUpIcon}
            kind={"tertiary"}
            size="lg"
            aria-label={/*TODO*/ t("action.edit")}
          />
        }
      >
        {options?.map((option) => (
          <MenuItem
            hideChevron
            label={option.label}
            Icon={
              IconOptions && (
                <IconOptions
                  width={24}
                  height={24}
                  className={styles.itemIcon}
                />
              )
            }
            onSelect={(e) => {
              onSelect?.(option.id);
              setPlannedSelection(option.id);
              e.preventDefault();
            }}
            key={option.id}
          >
            {selectedOption === option.id && (
              <CheckIcon width={24} height={24} />
            )}
            {selectedOption !== option.id && plannedSelection === option.id && (
              <SpinnerIcon width={24} height={24} className={styles.rotate} />
            )}
          </MenuItem>
        ))}
        {(toggles?.length ?? 0) > 0 && <hr />}
        {toggles?.map((toggle) => (
          <ToggleMenuItem
            label={toggle.label}
            onSelect={(e) => {
              onSelect?.(toggle.id);
              e.preventDefault();
            }}
            checked={toggle.enabled}
            key={toggle.id}
          />
        ))}
      </Menu>
    </div>
  );
};
