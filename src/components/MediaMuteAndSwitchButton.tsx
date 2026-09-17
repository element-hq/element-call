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

/**
 * Stands for wherever the platform is sending audio, where it will not say.
 *
 * Not a device id the browser would recognise: nothing can be selected on a
 * platform that lists no outputs, so this is only ever shown, never sent.
 */
const DEFAULT_OUTPUT_ID = "default";

/**
 * The share of the call area the device list may fill.
 *
 * The menu carries its headings and the level meter as well, and a list that
 * took the whole call would hide the call it belongs to.
 */
const LIST_SHARE_OF_CALL = 0.6;

/**
 * The shortest the device list may be, whatever the call measures.
 *
 * A share alone collapses in a small call to a list that shows one device and
 * gives no sign that there are others. Scrolling a short list is the better
 * failure.
 */
const MIN_LIST_HEIGHT = 160;

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

  // Radix focuses whatever the pointer is over, so the browser's own
  // :focus-visible cannot tell us whether a person is navigating by keyboard:
  // Chromium answers yes to everything after any key press, Firefox answers no
  // to programmatic focus. Track it ourselves and let the styling follow.
  /**
   * Tracks which modality moved the focus, for as long as the list is mounted.
   *
   * A ref rather than an effect on `menuOpen`: that state is ours, the open
   * menu is Radix's, and the two do not commit together — an effect keyed on
   * ours can run before Radix has mounted the content, with nothing to attach
   * to. The list existing is the honest signal that the menu is open.
   *
   * Recorded on the menu rather than held in state, because every item the menu
   * can focus has to answer to it — the device rows and the camera menu's blur
   * toggle, which is the menu's child and not the list's — and because which
   * modality someone is using changes nothing that has to be rendered again.
   */
  const trackFocusModality = useCallback(
    (list: HTMLDivElement | null): (() => void) | undefined => {
      // Watched on the menu, not on the document. Element Call can be mounted
      // more than once in a host's page, and the menu is portalled out of the
      // call root, so a document listener would also answer for a key pressed
      // in the other instance, or in the host's own page. The menu rather than
      // the list, because the first arrow key arrives while the menu itself
      // holds focus, above anything we render.
      const menu = list?.closest<HTMLElement>('[role="menu"]');
      if (menu === null || menu === undefined) return;
      // Each opening starts over: the modality belongs to whoever is using this
      // menu now, not to whoever last used it.
      const record = (modality: "keyboard" | "pointer"): void => {
        menu.dataset.focusModality = modality;
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

  // The menu is portalled outside the call root, so nothing in the stylesheets
  // can size it against the call. Measure the call area rather than the window,
  // or the menu is wrong wherever Element Call is not the whole page.
  const rootElement = useRootElement();
  const [listMaxHeight, setListMaxHeight] = useState<number>();
  useEffect(() => {
    if (!menuOpen) return;
    // Followed rather than measured once: a host can resize the space Element
    // Call is drawn in while the menu is open — a panel animating, a window
    // dragged, a phone turned — and a bound taken on opening then describes a
    // call area that no longer exists. Quantised before it reaches React, so a
    // resize re-renders only when the bound itself moves.
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

  // Only while the menu is open, so nothing holds a second capture of the
  // microphone for the length of a call.
  // The meter sits over the foot of the scrolling list, so the list has to
  // keep that much of itself clear: a row scrolled to by the keyboard would
  // otherwise arrive underneath it, half-read. Its own height, measured,
  // because the failure states are two lines where a level is one.
  const [meterHeight, setMeterHeight] = useState<number>();
  const meter = useCallback(
    (element: HTMLDivElement | null): (() => void) | undefined => {
      if (element === null) return;
      const subscription = observeElementSize$(element)
        .pipe(
          map(({ height }) => height),
          distinctUntilChanged(),
        )
        .subscribe(setMeterHeight);
      return (): void => subscription.unsubscribe();
    },
    [],
  );

  // The headings stand over the head of the list, so it has to keep their
  // height clear too — the same bargain as the meter, at the other end. One
  // measurement serves both: the sections are headed alike.
  const [headingHeight, setHeadingHeight] = useState<number>();
  const heading = useCallback(
    (element: HTMLDivElement | null): (() => void) | undefined => {
      if (element === null) return;
      const subscription = observeElementSize$(element)
        .pipe(
          map(({ height }) => height),
          distinctUntilChanged(),
        )
        .subscribe(setHeadingHeight);
      return (): void => subscription.unsubscribe();
    },
    [],
  );

  const microphoneState = useMicrophoneLevel(
    selectedOption,
    menuOpen && iconsAndLabels === "audio",
  );

  useEffect(() => {
    if (menuOpen) devices.requestDeviceNames(); // No-op after the first call
  }, [menuOpen, devices]);

  // The mute control differs between the two only in which button it is and
  // what it is called; how it behaves is the same, and was worth saying once.
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

  // Only the camera menu carries a toggle, and only when the caller offers one.
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

  // Safari enumerates no output devices at all, and offers no way to choose
  // one, so the list arrives empty. The section is shown all the same — audio
  // is playing somewhere — naming that somewhere and disabling it like any
  // single entry. A heading with nothing beneath it reads as a broken feature,
  // and leaves the menu a different shape on one browser.
  const noOutputsListed = outputOptions?.length === 0;
  const speakerOptions: MenuOptions[] | undefined = noOutputsListed
    ? [{ id: DEFAULT_OUTPUT_ID, label: { type: "default", name: null } }]
    : outputOptions;
  // And it is the selection, not merely the only row: it is where audio is
  // going. An unchecked lone entry reads as nothing being chosen at all.
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
          // Inert, not aria-hidden: a form control inside a menu item must be
          // out of the focus order and out of the accessibility tree, and
          // aria-hidden alone leaves it focusable. The item's aria-checked is
          // what conveys the selection.
          <span inert>
            <RadioInput
              checked={selected === id}
              disabled={disabled}
              // Not readOnly: that styles the control as muted, losing the
              // accent fill that marks the selection. The menu item owns the
              // interaction, so the change handler has nothing to do.
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
        <div
          ref={trackFocusModality}
          // Transparent to assistive technology, so the menu still sees its
          // items as its own children.
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
                  heading belongs to a group rather than sitting beside the
                  items it names. */}
              <div role="group" aria-label={t("settings.devices.speaker")}>
                {/* The heading is decoration: the group carries the name, and
                    a menu may only contain items, separators and groups. */}
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
              <Separator />
            </>
          )}
          <div role="group" aria-label={optionsButtonLabel}>
            <div ref={heading} aria-hidden className={styles.sectionHeading}>
              <MenuTitle title={optionsButtonLabel} />
            </div>
            {/* The heading sits outside, so the meter can never ride up over it:
              sticky only holds while this block is in view. */}
            <div role="none">
              {deviceItems(
                "input",
                options,
                selectedOption,
                onSelect,
                numberedLabel,
              )}
              {iconsAndLabels === "audio" && (
                <MicrophoneLevelMeter
                  ref={meter}
                  state={microphoneState}
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
