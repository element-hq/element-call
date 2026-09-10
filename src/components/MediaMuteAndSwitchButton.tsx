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
  type JSX,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
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
import { AudioLevelMeter } from "./AudioLevelMeter";
import { useMicrophoneLevel } from "./useMicrophoneLevel";

export interface MenuOptions {
  label: DeviceLabel;
  id: string;
}

export interface OutputMenuOptions {
  label: AudioOutputDeviceLabel;
  id: string;
}

/**
 * The controls that turn the microphone chevron menu into the audio menu: a
 * speaker group below the microphone list. Absent for the camera menu.
 */
export interface AudioControls {
  /**
   * The audio outputs to choose from. Empty where the browser does not allow
   * choosing one; the menu then names the default output instead.
   */
  outputOptions: OutputMenuOptions[];
  selectedOutput: string | undefined;
  onSelectOutput: (id: string) => void;
  /** The microphone the level meter follows. */
  micDeviceId: string | undefined;
}

export interface MediaMuteAndSwitchButtonProps {
  /** The title used in the Switcher modal. */
  title: string;
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
  videoBlurToggleClick?: () => void;
  videoBlurEnabled?: boolean;
  /** When present, the menu renders the speaker group below the microphone list. */
  audioControls?: AudioControls;
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
  videoBlurEnabled,
  videoBlurToggleClick,
  onSelect,
  audioControls,
}) => {
  const [plannedSelection, setPlannedSelection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusy = busy ?? false;
  const { t } = useTranslation();
  const devices = useMediaDevices();

  useEffect(() => {
    if (menuOpen) devices.requestDeviceNames(); // No-op after the first call
  }, [menuOpen, devices]);

  // The meter's capture is bound to the menu being open, so the microphone is
  // only ever held while the user is looking at the level.
  const micLevel = useMicrophoneLevel(
    audioControls?.micDeviceId,
    menuOpen && audioControls !== undefined,
  );

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
  let numberedLabel: (number: number) => string;
  switch (iconsAndLabels) {
    case "video":
      IconOptions = VideoCallIcon;
      optionsButtonLabel = t("settings.devices.camera");
      numberedLabel = (n): string =>
        t("settings.devices.camera_numbered", { n });
      break;
    case "audio":
      IconOptions = MicOnIcon;
      optionsButtonLabel = t("settings.devices.microphone");
      numberedLabel = (n): string =>
        t("settings.devices.microphone_numbered", { n });
      break;
  }

  const deviceItems = options?.map(({ label, id }) => {
    let labelText: string;
    switch (label.type) {
      case "name":
        labelText = label.name;
        break;
      case "number":
        labelText = numberedLabel(label.number);
        break;
    }
    return (
      <MenuItem
        hideChevron
        label={labelText}
        Icon={
          IconOptions && (
            <IconOptions
              width={24}
              height={24}
              className={styles.itemIcon}
              aria-hidden
            />
          )
        }
        onSelect={(e) => {
          e.preventDefault();
          if (id === selectedOption) return;
          setPlannedSelection(id);
          onSelect?.(id);
        }}
        key={id}
        role="menuitemradio"
        aria-checked={selectedOption === id}
      >
        {selectedOption === id && (
          <CheckIcon
            width={24}
            height={24}
            aria-hidden // A label would be redundant to aria-checked above
          />
        )}
        {selectedOption !== id && plannedSelection === id && (
          <SpinnerIcon
            width={24}
            height={24}
            className={styles.rotate}
            aria-label={t("settings.devices.activating")}
          />
        )}
      </MenuItem>
    );
  });

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
        className={styles.menu}
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
        {audioControls ? (
          <div
            className={styles.micSection}
            data-testid="audio_menu_mic_section"
          >
            {deviceItems}
            {/* The meter reads the microphone, so it travels with the
                microphone list rather than sitting among the output controls;
                pinned to the foot of the list, it stays on screen for as long
                as any microphone is. */}
            <div className={styles.stickyMeter}>
              <AudioLevelMeter state={micLevel} />
            </div>
          </div>
        ) : (
          deviceItems
        )}
        {audioControls && (
          <>
            <hr />
            <SpeakerSection
              options={audioControls.outputOptions}
              selected={audioControls.selectedOutput}
              onSelect={audioControls.onSelectOutput}
            />
          </>
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

interface SpeakerSectionProps {
  options: OutputMenuOptions[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}

/**
 * The speaker group of the audio menu.
 *
 * With more than one output to choose from this is a radio group. With one or
 * none it still names the output in use, as a plain row: knowing where audio
 * goes is useful even where it cannot be redirected, as in browsers that do
 * not support choosing an output at all.
 */
function SpeakerSection({
  options,
  selected,
  onSelect,
}: SpeakerSectionProps): JSX.Element {
  const { t } = useTranslation();
  const labelText = (label: AudioOutputDeviceLabel): string => {
    switch (label.type) {
      case "name":
        return label.name;
      case "number":
        return t("settings.devices.speaker_numbered", { n: label.number });
      case "speaker":
        return t("settings.devices.loudspeaker");
      case "earpiece":
        return t("settings.devices.handset");
      case "default":
        return label.name === null
          ? t("settings.devices.default")
          : `${t("settings.devices.default")} (${label.name})`;
    }
  };
  const icon = (
    <VolumeOnIcon
      width={24}
      height={24}
      className={styles.itemIcon}
      aria-hidden
    />
  );

  if (options.length <= 1) {
    const only = options[0];
    return (
      <div className={styles.readOnlyRow} data-testid="speaker_readonly">
        {icon}
        <span>
          {only ? labelText(only.label) : t("settings.devices.default")}
        </span>
      </div>
    );
  }

  return (
    <>
      {options.map(({ id, label }) => (
        <MenuItem
          hideChevron
          key={id}
          label={labelText(label)}
          Icon={icon}
          onSelect={(e) => {
            e.preventDefault();
            if (id !== selected) onSelect(id);
          }}
          role="menuitemradio"
          aria-checked={selected === id}
        >
          {selected === id && <CheckIcon width={24} height={24} aria-hidden />}
        </MenuItem>
      ))}
    </>
  );
}
