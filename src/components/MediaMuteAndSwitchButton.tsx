/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState, type FC, useEffect, type ReactElement } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTitle,
  RadioInput,
  Separator,
  ToggleMenuItem,
} from "@vector-im/compound-web";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  SpinnerIcon,
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
import { MicrophoneLevelMeter } from "./MicrophoneLevelMeter";
import { useMicrophoneLevel } from "./useMicrophoneLevel";

export interface MenuOptions {
  label: DeviceLabel | AudioOutputDeviceLabel;
  id: string;
}

export interface MediaMuteAndSwitchButtonProps {
  /**
   * The accessible name of the menu. Defaults to a translated name for the
   * media kind. Never shown: each section carries its own heading.
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
   * Called when an output device is picked. Undefined means no output can be
   * chosen here, and the section renders disabled.
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
  // Which device we have asked for but not yet been given. Carries the kind as
  // well as the id, because an input and an output can share an id: "default"
  // names both on Chrome.
  const [plannedSelection, setPlannedSelection] = useState<{
    kind: "input" | "output";
    id: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusy = busy ?? false;
  const { t } = useTranslation();
  const devices = useMediaDevices();
  // Only while the menu is open, so nothing holds a second capture of the
  // microphone for the length of a call.
  const microphoneState = useMicrophoneLevel(
    selectedOption,
    menuOpen && iconsAndLabels === "audio",
  );

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

  let optionsButtonLabel: string;
  let defaultMenuTitle: string;
  let numberedLabel: (number: number) => string;
  switch (iconsAndLabels) {
    case "video":
      optionsButtonLabel = t("settings.devices.camera");
      defaultMenuTitle = t("settings.devices.camera_source");
      numberedLabel = (n): string =>
        t("settings.devices.camera_numbered", { n });
      break;
    case "audio":
      optionsButtonLabel = t("settings.devices.microphone");
      defaultMenuTitle = t("settings.devices.mic_source");
      numberedLabel = (n): string =>
        t("settings.devices.microphone_numbered", { n });
      break;
  }

  /** The text shown for a device, whichever kind of label it carries. */
  const labelText = (
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

  // A device we asked for that has not arrived yet. Until it does, nothing in
  // the menu can be picked, so a second request cannot overtake the first.
  const settling =
    plannedSelection !== null &&
    plannedSelection.id !==
      (plannedSelection.kind === "output"
        ? selectedOutputOption
        : selectedOption);

  const deviceItems = (
    kind: "input" | "output",
    items: MenuOptions[] | undefined,
    selected: string | undefined,
    select: ((id: string) => void) | undefined,
    numbered: (n: number) => string,
  ): ReactElement[] => {
    const list = items ?? [];
    // Shown but not choosable when nothing can be picked here, or when there is
    // only one device. The entry stays visible so the menu keeps the same shape
    // on every platform.
    const disabled = select === undefined || list.length <= 1 || settling;
    return list.map(({ label, id }) => (
      <MenuItem
        // A radio input inside a button is invalid, and the menu needs an
        // element it can give menuitemradio semantics to.
        as="div"
        hideChevron
        disabled={disabled}
        label={labelText(label, numbered)}
        Icon={
          <RadioInput
            // Decoration: aria-checked on the menu item is what conveys the
            // selection, and Radix owns focus within the menu.
            aria-hidden
            tabIndex={-1}
            checked={selected === id}
            disabled={disabled}
            readOnly
          />
        }
        onSelect={(e) => {
          e.preventDefault();
          if (id === selected) return;
          setPlannedSelection({ kind, id });
          select?.(id);
        }}
        key={id}
        role="menuitemradio"
        aria-checked={selected === id}
      >
        {selected !== id &&
          plannedSelection?.kind === kind &&
          plannedSelection.id === id && (
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
        {iconsAndLabels === "audio" && outputOptions && (
          <>
            <MenuTitle title={t("settings.devices.speaker")} />
            {deviceItems(
              "output",
              outputOptions,
              selectedOutputOption,
              onSelectOutput,
              (n) => t("settings.devices.speaker_numbered", { n }),
            )}
            <Separator />
          </>
        )}
        <MenuTitle title={optionsButtonLabel} />
        {deviceItems("input", options, selectedOption, onSelect, numberedLabel)}
        {iconsAndLabels === "audio" && (
          <MicrophoneLevelMeter state={microphoneState} />
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
