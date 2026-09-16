/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentType,
  useState,
  type FC,
  useEffect,
  type ReactElement,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTitle,
  Separator,
  ToggleMenuItem,
} from "@vector-im/compound-web";
import {
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MicOnIcon,
  SpinnerIcon,
  VideoCallIcon,
  VolumeOnIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import styles from "./MediaMuteAndSwitchButton.module.css";
import { MicButton, VideoButton } from "../button";
import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
} from "../state/MediaDevices";
import { useMediaDevices } from "../MediaDevicesContext";

export interface MenuOptions {
  label: DeviceLabel | AudioOutputDeviceLabel;
  id: string;
}

export interface MediaMuteAndSwitchButtonProps {
  /**
   * The accessible name of the menu. Defaults to a translated name for the
   * media kind; the menu's own title is not shown, since each section carries
   * its own heading.
   */
  title?: string;
  /** If the Mute button is enabled */
  enabled?: boolean;
  /** Callback if the mute button is clicked */
  onMuteClick?: () => void;
  /** True while mute/unmute operation is syncing. */
  busy?: boolean;
  iconsAndLabels: "video" | "audio";
  /** The options available for the media device selector modal */
  options?: MenuOptions[];
  /** The option that will currently be rendered as the selected option */
  selectedOption?: string;
  /**
   * Output (speaker) devices, shown as their own section above the input
   * section. Audio menu only; omitted entirely for video.
   */
  outputOptions?: MenuOptions[];
  /** The output option currently rendered as selected */
  selectedOutputOption?: string;
  /**
   * Called when an output device is picked. Undefined means the platform does
   * not permit choosing an output, and the section renders disabled.
   */
  onSelectOutput?: (id: string) => void;
  videoBlurToggleClick?: () => void;
  videoBlurEnabled?: boolean;
  /**
   * For any toggle and option this method will be called.
   * So toggles need to be implemented by listening here and setting the right toggle item to `enabled`
   */
  onSelect?: (id: string) => void;
}

const BLUR_ID = "blur";

export const MediaMuteAndSwitchButton: FC<MediaMuteAndSwitchButtonProps> = ({
  title,
  enabled,
  busy,
  onMuteClick,
  iconsAndLabels,
  options,
  selectedOption,
  outputOptions,
  selectedOutputOption,
  onSelectOutput,
  videoBlurEnabled,
  videoBlurToggleClick,
  onSelect,
}) => {
  const [plannedSelection, setPlannedSelection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusy = busy ?? false;
  const { t } = useTranslation();
  const devices = useMediaDevices();

  useEffect(() => {
    if (menuOpen) devices.requestDeviceNames(); // No-op after the first call
  }, [menuOpen, devices]);

  let button;
  let toggles: { label: string; enabled: boolean; id: string }[] = [];
  switch (iconsAndLabels) {
    case "video":
      button = (
        <VideoButton
          enabled={enabled ?? false}
          busy={isBusy}
          onClick={(e) => {
            onMuteClick?.();
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={isBusy || onMuteClick === undefined}
          data-testid="incall_videomute"
        />
      );
      if (videoBlurToggleClick !== undefined) {
        toggles = [
          {
            label: t("action.blur_background"),
            enabled: videoBlurEnabled ?? false,
            id: BLUR_ID,
          },
        ];
      }
      break;
    case "audio":
      button = (
        <MicButton
          enabled={enabled ?? false}
          busy={isBusy}
          onClick={(e) => {
            onMuteClick?.();
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={isBusy || onMuteClick === undefined}
          data-testid="incall_mute"
        />
      );
      break;
  }

  let IconOptions: ComponentType<React.SVGAttributes<SVGElement>> | undefined;
  let optionsButtonLabel: string;
  let defaultMenuTitle: string;
  let numberedLabel: (number: number) => string;
  switch (iconsAndLabels) {
    case "video":
      IconOptions = VideoCallIcon;
      optionsButtonLabel = t("settings.devices.camera");
      defaultMenuTitle = t("settings.devices.camera_source");
      numberedLabel = (n): string =>
        t("settings.devices.camera_numbered", { n });
      break;
    case "audio":
      IconOptions = MicOnIcon;
      optionsButtonLabel = t("settings.devices.microphone");
      defaultMenuTitle = t("settings.devices.mic_source");
      numberedLabel = (n): string =>
        t("settings.devices.microphone_numbered", { n });
      break;
  }

  const labelToText = (
    label: MenuOptions["label"],
    numbered: (n: number) => string,
  ): string => {
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

  const deviceItems = (
    items: MenuOptions[] | undefined,
    selected: string | undefined,
    select: ((id: string) => void) | undefined,
    numbered: (n: number) => string,
    Icon: ComponentType<React.SVGAttributes<SVGElement>> | undefined,
  ): ReactElement[] => {
    const list = items ?? [];
    // Shown but not choosable when the platform will not switch this kind of
    // device, or when there is only one of them. The entry stays visible so the
    // menu keeps the same shape everywhere.
    const disabled = select === undefined || list.length <= 1;
    return list.map(({ label, id }) => (
      <MenuItem
        hideChevron
        disabled={disabled}
        label={labelToText(label, numbered)}
        Icon={
          Icon && (
            <Icon
              width={24}
              height={24}
              className={styles.itemIcon}
              aria-hidden
            />
          )
        }
        onSelect={(e) => {
          e.preventDefault();
          if (id === selected) return;
          setPlannedSelection(id);
          select?.(id);
        }}
        key={id}
        role="menuitemradio"
        aria-checked={selected === id}
      >
        {selected === id && (
          <CheckIcon
            width={24}
            height={24}
            aria-hidden // A label would be redundant to aria-checked above
          />
        )}
        {selected !== id && plannedSelection === id && (
          <SpinnerIcon
            width={24}
            height={24}
            className={styles.rotate}
            aria-label={t("settings.devices.activating")}
          />
        )}
      </MenuItem>
    ));
  };

  const showOutputSection = iconsAndLabels === "audio" && outputOptions;

  return (
    <div
      className={classNames({
        [styles.container]: true,
        [styles.containerOpen]: menuOpen,
      })}
    >
      {/* The mute button lives inside */}
      {button}
      <Menu
        title={title ?? defaultMenuTitle}
        // Each section carries its own heading, so the menu's own title would
        // sit on top of the first one. Kept for the accessible name only.
        showTitle={false}
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
        {showOutputSection && (
          <>
            <MenuTitle title={t("settings.devices.speaker")} />
            {deviceItems(
              outputOptions,
              selectedOutputOption,
              onSelectOutput,
              (n) => t("settings.devices.speaker_numbered", { n }),
              VolumeOnIcon,
            )}
            <Separator />
          </>
        )}
        <MenuTitle title={optionsButtonLabel} />
        {deviceItems(
          options,
          selectedOption,
          onSelect,
          numberedLabel,
          IconOptions,
        )}
        {(toggles?.length ?? 0) > 0 && <hr />}
        {toggles?.map((toggle) => (
          <ToggleMenuItem
            label={toggle.label}
            onSelect={(e) => {
              videoBlurToggleClick?.();
              e.preventDefault();
            }}
            checked={toggle.enabled ?? false}
            key={toggle.id}
          />
        ))}
      </Menu>
    </div>
  );
};
