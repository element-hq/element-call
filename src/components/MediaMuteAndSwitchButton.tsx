/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useCallback,
  useState,
  type CSSProperties,
  type FC,
  useEffect,
  type ReactElement,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTitle,
  RadioInput,
  ToggleMenuItem,
} from "@vector-im/compound-web";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  SpinnerIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { distinctUntilChanged, map } from "rxjs";

import styles from "./MediaMuteAndSwitchButton.module.css";
import { MicButton, VideoButton } from "../button";
import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
} from "../state/MediaDevices";
import { useMediaDevices } from "../MediaDevicesContext";
import { useRootElement } from "../RootElementContext";
import { observeElementSize$ } from "../utils/elementSize";
import { LiveMicrophoneLevelMeter } from "./MicrophoneLevelMeter";

export interface MenuOptions {
  label: DeviceLabel | AudioOutputDeviceLabel;
  id: string;
}

export interface MediaMuteAndSwitchButtonProps {
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
  /** Output (speaker) devices. Audio menu only. */
  outputOptions?: MenuOptions[];
  /** The output option currently rendered as selected */
  selectedOutputOption?: string;
  /** Picks an output device. Undefined disables the speaker section. */
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

/** Id of the placeholder "Default" row, shown when the platform lists no outputs. */
const DEFAULT_OUTPUT_ID = "default";

/** Largest share of the call area's height the device list may take. */
const LIST_SHARE_OF_CALL = 0.6;

/** Smallest device list height in px, so a short call still shows more than one device. */
const MIN_LIST_HEIGHT = 160;

export const MediaMuteAndSwitchButton: FC<MediaMuteAndSwitchButtonProps> = ({
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
  // Requested but not yet selected. Keyed by kind too, since Chrome uses
  // "default" for both an input and an output.
  const [plannedSelection, setPlannedSelection] = useState<{
    kind: "input" | "output";
    id: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const onOpenChange = useCallback((open: boolean): void => {
    setMenuOpen(open);
    // Drop a request that never arrived.
    if (!open) setPlannedSelection(null);
  }, []);
  const isBusy = busy ?? false;
  const { t } = useTranslation();
  const devices = useMediaDevices();

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

  // Measured on the call area: CSS can't size the portalled menu against it.
  const rootElement = useRootElement();
  const [listMaxHeight, setListMaxHeight] = useState<number>();
  useEffect(() => {
    if (!menuOpen) return;
    // Followed, since a host can resize the call while the menu is open.
    const subscription = observeElementSize$(rootElement)
      .pipe(
        map(({ height }) =>
          Math.max(MIN_LIST_HEIGHT, Math.round(height * LIST_SHARE_OF_CALL)),
        ),
        distinctUntilChanged(),
      )
      .subscribe(setListMaxHeight);
    return (): void => subscription.unsubscribe();
  }, [menuOpen, rootElement]);

  // Kept clear at the list's foot, so a row reached by keyboard isn't under
  // the meter.
  const [meterHeight, meter] = useMeasuredHeight();

  // Likewise at its head, for the sticky headings.
  const [headingHeight, heading] = useMeasuredHeight();

  useEffect(() => {
    if (menuOpen) devices.requestDeviceNames(); // No-op after the first call
  }, [menuOpen, devices]);

  const MuteButton = iconsAndLabels === "audio" ? MicButton : VideoButton;
  const button = (
    <MuteButton
      enabled={enabled ?? false}
      busy={isBusy}
      onClick={(e) => {
        onMuteClick?.();
        e.preventDefault();
        e.stopPropagation();
      }}
      disabled={isBusy || onMuteClick === undefined}
      data-testid={
        iconsAndLabels === "audio" ? "incall_mute" : "incall_videomute"
      }
    />
  );

  const toggles =
    iconsAndLabels === "video" && videoBlurToggleClick !== undefined
      ? [
          {
            label: t("action.blur_background"),
            enabled: videoBlurEnabled ?? false,
            id: BLUR_ID,
          },
        ]
      : [];

  let optionsButtonLabel: string;
  let menuTitle: string;
  let numberedLabel: (number: number) => string;
  switch (iconsAndLabels) {
    case "video":
      optionsButtonLabel = t("settings.devices.camera");
      menuTitle = t("settings.devices.camera_source");
      numberedLabel = (n): string =>
        t("settings.devices.camera_numbered", { n });
      break;
    case "audio":
      optionsButtonLabel = t("settings.devices.microphone");
      menuTitle = t("settings.devices.mic_source");
      numberedLabel = (n): string =>
        t("settings.devices.microphone_numbered", { n });
      break;
  }

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

  // Nothing can be picked while a requested device is on offer but not yet
  // selected, so a second request can't overtake it.
  const plannedOutput = plannedSelection?.kind === "output";
  const selectedOfPlannedKind = plannedOutput
    ? selectedOutputOption
    : selectedOption;
  const offeredOfPlannedKind = plannedOutput ? outputOptions : options;
  const settling =
    plannedSelection !== null &&
    plannedSelection.id !== selectedOfPlannedKind &&
    offeredOfPlannedKind?.some(({ id }) => id === plannedSelection.id) === true;

  // Safari lists no outputs: show a disabled, selected Default rather than an
  // empty section.
  const noOutputsListed = outputOptions?.length === 0;
  const speakerOptions: MenuOptions[] | undefined = noOutputsListed
    ? [{ id: DEFAULT_OUTPUT_ID, label: { type: "default", name: null } }]
    : outputOptions;
  const selectedSpeaker = noOutputsListed
    ? DEFAULT_OUTPUT_ID
    : selectedOutputOption;

  const deviceItems = (
    kind: "input" | "output",
    items: MenuOptions[] | undefined,
    selected: string | undefined,
    select: ((id: string) => void) | undefined,
    numbered: (n: number) => string,
  ): ReactElement[] => {
    const list = items ?? [];
    // Disabled rather than hidden, so the menu keeps its shape.
    const disabled = select === undefined || list.length <= 1 || settling;
    return list.map(({ label, id }) => (
      <MenuItem
        // A radio input may not sit inside a button.
        as="div"
        hideChevron
        disabled={disabled}
        label={labelText(label, numbered)}
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
        className={styles.menu}
        // Named for screen readers only: each section has its own heading.
        title={menuTitle}
        showTitle={false}
        open={menuOpen}
        onOpenChange={onOpenChange}
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
        <div
          ref={trackFocusSource}
          // Keeps the items the menu's own children for assistive tech.
          role="none"
          className={styles.deviceList}
          style={
            {
              "--device-list-max-height":
                listMaxHeight === undefined ? undefined : `${listMaxHeight}px`,
              "--device-list-scroll-padding-end":
                meterHeight === undefined ? undefined : `${meterHeight}px`,
              "--device-list-scroll-padding-start":
                headingHeight === undefined ? undefined : `${headingHeight}px`,
            } as CSSProperties
          }
        >
          {iconsAndLabels === "audio" && speakerOptions && (
            <>
              {/* A menu may only contain items, separators and groups, so each
                  heading is a hidden part of a named group. */}
              <div role="group" aria-label={t("settings.devices.speaker")}>
                <div aria-hidden className={styles.sectionHeading}>
                  <MenuTitle title={t("settings.devices.speaker")} />
                </div>
                {deviceItems(
                  "output",
                  speakerOptions,
                  selectedSpeaker,
                  onSelectOutput,
                  (n) => t("settings.devices.speaker_numbered", { n }),
                )}
              </div>
            </>
          )}
          <div role="group" aria-label={optionsButtonLabel}>
            <div ref={heading} aria-hidden className={styles.sectionHeading}>
              <MenuTitle title={optionsButtonLabel} />
            </div>
            {/* Apart from the heading, so the sticky meter can't ride over it. */}
            <div role="none">
              {deviceItems(
                "input",
                options,
                selectedOption,
                onSelect,
                numberedLabel,
              )}
              {iconsAndLabels === "audio" && (
                <LiveMicrophoneLevelMeter
                  ref={meter}
                  deviceId={selectedOption}
                  // Only while open, so the microphone isn't held all call.
                  active={menuOpen}
                  className={styles.stickyMeter}
                />
              )}
            </div>
          </div>
        </div>
        {toggles.length > 0 && <hr />}
        {toggles.map((toggle) => (
          <ToggleMenuItem
            label={toggle.label}
            onSelect={(e) => {
              videoBlurToggleClick?.();
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

/** Follows an element's height. */
function useMeasuredHeight(): [
  number | undefined,
  (element: HTMLElement | null) => (() => void) | undefined,
] {
  const [height, setHeight] = useState<number>();
  const ref = useCallback(
    (element: HTMLElement | null): (() => void) | undefined => {
      if (element === null) return;
      const subscription = observeElementSize$(element)
        .pipe(
          map((size) => size.height),
          distinctUntilChanged(),
        )
        .subscribe(setHeight);
      return (): void => subscription.unsubscribe();
    },
    [],
  );
  return [height, ref];
}
