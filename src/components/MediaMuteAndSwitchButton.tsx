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
  ChevronDownIcon,
  MicOffSolidIcon,
  MicOnIcon,
  MicOnSolidIcon,
  SpinnerIcon,
  VideoCallIcon,
  VideoCallOffSolidIcon,
  VideoCallSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { logger } from "matrix-js-sdk/lib/logger";

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

export interface IconsAndLabels {
  /** The Icon used if the mute button is enabled */
  IconEnabled: ComponentType<React.SVGAttributes<SVGElement>>;
  /** The Icon used if the mute button is disabled */
  IconDisabled: ComponentType<React.SVGAttributes<SVGElement>>;
  /** The icon used for the different options */
  IconOptions?: ComponentType<React.SVGAttributes<SVGElement>>;
  enabledLabel: string;
  disabledLabel: string;
  optionsButtonLabel: string;
}

export interface MediaMuteAndSwitchButtonProps {
  /** The title used in the Switcher modal. */
  title: string;
  /** If the Mute button is enabled */
  enabled?: boolean;
  /** Callback if the mute button is clicked */
  onMuteClick?: () => void;
  iconsAndLabels?: "video" | "audio" | IconsAndLabels;
  /** The options available for the media device selector modal */
  options?: MenuOptions[];
  /** The option that will currently be rendered as the selected option */
  selectedOption?: string;
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
  iconsAndLabels: iconsAndLabelsWithDefaultCases,
  options,
  selectedOption,
  toggles,
  onSelect,
}) => {
  const [plannedSelection, setPlannedSelection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  let iconsAndLabels: IconsAndLabels | undefined;
  switch (iconsAndLabelsWithDefaultCases) {
    case "video":
      iconsAndLabels = {
        IconEnabled: VideoCallSolidIcon,
        IconDisabled: VideoCallOffSolidIcon,
        IconOptions: VideoCallIcon,
        disabledLabel: t("stop_video_button_label"),
        enabledLabel: t("start_video_button_label"),
        optionsButtonLabel: t("settings.devices.camera"),
      };
      break;
    case "audio":
      iconsAndLabels = {
        IconEnabled: MicOnSolidIcon,
        IconDisabled: MicOffSolidIcon,
        IconOptions: MicOnIcon,
        disabledLabel: t("mute_microphone_button_label"),
        enabledLabel: t("unmute_microphone_button_label"),
        optionsButtonLabel: t("settings.devices.microphone"),
      };
      break;
    default:
      iconsAndLabels = iconsAndLabelsWithDefaultCases;
      break;
  }
  const {
    IconEnabled,
    IconDisabled,
    IconOptions,
    disabledLabel,
    enabledLabel,
    optionsButtonLabel,
  } = iconsAndLabels ?? {
    IconEnabled: undefined,
    IconDisabled: undefined,
    IconOptions: undefined,
    disabledLabel: undefined,
    enabledLabel: undefined,
    optionsButtonLabel: undefined,
  };
  {
    logger.info(
      "RENDER WITH: selectedOption !== option.id && plannedSelection === option.id",
      selectedOption,
      " !==",
      "option.id",
      " && ",
      plannedSelection,
      " === ",
      "option.id",
    );
  }
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
        role="switch"
        Icon={enabled ? IconEnabled : IconDisabled}
        onClick={(e) => {
          onMuteClick?.();
          e.preventDefault();
          e.stopPropagation();
        }}
        kind={enabled ? "secondary" : "primary"}
        size="lg"
        className={styles.button}
        aria-label={enabled ? disabledLabel : enabledLabel}
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
            className={classNames({
              [styles.menuButton]: true,
              [styles.chevronIconOpen]: menuOpen,
            })}
            Icon={menuOpen ? ChevronUpIcon : ChevronDownIcon}
            kind={"tertiary"}
            size="lg"
            aria-label={optionsButtonLabel}
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
              e.preventDefault();
              if (option.id === selectedOption) return;
              setPlannedSelection(option.id);
              onSelect?.(option.id);
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
