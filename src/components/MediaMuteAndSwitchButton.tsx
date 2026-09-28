/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  useEffect,
  type ReactElement,
} from "react";
import {
  Alert,
  Button,
  Menu,
  MenuItem,
  MenuTitle,
  RadioInput,
} from "@vector-im/compound-web";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  InfoIcon,
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
import {
  BackgroundEffectGrid,
  type BackgroundEffectOption,
} from "./BackgroundEffectGrid";
import { menuIsDrawer } from "./menuIsDrawer";

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
  /** Camera menu only. None or an empty list leaves the section out. */
  backgroundEffects?: BackgroundEffectOption[];
  selectedBackgroundEffect?: string;
  /** Undefined where effects can't run: all but no effect are disabled. */
  onSelectBackgroundEffect?: (id: string) => void;
  /** What the user should know before choosing an effect, if anything. */
  backgroundEffectNotice?: string;
  /** Whether the first effect chosen is still being prepared. */
  backgroundEffectSettling?: boolean;
  /** Called with the file chosen from the add tile. Omit to leave it out. */
  onAddBackgroundImage?: (file: File) => void;
  /** Removes a removable effect, never the one in force. */
  onRemoveBackgroundEffect?: (id: string) => void;
  /** Why the last file offered couldn't be used; a new object each time. */
  backgroundImageRefusal?: { text: string };
  /**
   * For any toggle and option this method will be called.
   * So toggles need to be implemented by listening here and setting the right toggle item to `enabled`
   */
  onSelect?: (id: string) => void;
}

/** Id of the placeholder "Default" row, shown when the platform lists no outputs. */
const DEFAULT_OUTPUT_ID = "default";

/** Largest share of the call area's height the device list may take. */
const LIST_SHARE_OF_CALL = 0.6;

/** Smallest device list height in px, so a short call still shows more than one device. */
const MIN_LIST_HEIGHT = 160;

/** The width design sets for the menu; a long device name wraps instead. */
const MENU_WIDTH = 296;

/** Space kept between the menu and the call area's sides. */
const MENU_MARGIN = 16;

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
  backgroundEffects,
  selectedBackgroundEffect,
  onSelectBackgroundEffect,
  backgroundEffectNotice,
  backgroundEffectSettling,
  onAddBackgroundImage,
  onRemoveBackgroundEffect,
  backgroundImageRefusal,
  onSelect,
}) => {
  // Requested but not yet selected. Keyed by kind too, since Chrome uses
  // "default" for both an input and an output.
  const [plannedSelection, setPlannedSelection] = useState<{
    kind: "input" | "output";
    id: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The file picker takes the focus, which the menu reads as a click
  // elsewhere; it is held open until the picker is done.
  const choosingFile = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // A refusal is about the attempt that caused it: shown until dismissed or
  // until the menu closes, and again for the next one.
  const [seenRefusal, setSeenRefusal] = useState<object>();
  const refusal =
    backgroundImageRefusal !== seenRefusal ? backgroundImageRefusal : undefined;
  const onOpenChange = useCallback(
    (open: boolean): void => {
      if (!open && choosingFile.current) return;
      setMenuOpen(open);
      // Drop a request that never arrived.
      if (!open) setPlannedSelection(null);
      if (!open) setSeenRefusal(backgroundImageRefusal);
    },
    [backgroundImageRefusal],
  );
  // Scrolled to as it appears, as the list may be scrolled away from it.
  const scrollIntoView = useCallback((element: HTMLElement | null): void => {
    element?.scrollIntoView({ block: "nearest" });
  }, []);
  const watchFileInput = useCallback(
    (input: HTMLInputElement | null): (() => void) | undefined => {
      fileInput.current = input;
      if (input === null) return;
      // Dismissing the picker fires cancel, which React doesn't type.
      const done = (): void => {
        choosingFile.current = false;
      };
      input.addEventListener("cancel", done);
      return (): void => input.removeEventListener("cancel", done);
    },
    [],
  );
  const isBusy = busy ?? false;
  const { t } = useTranslation();
  const devices = useMediaDevices();
  const noticeId = useId();

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

  const watchList = useCallback(
    (list: HTMLDivElement | null): (() => void) | undefined => {
      const stopTracking = trackFocusSource(list);
      const stopWatching = list === null ? undefined : watchScrollEdges(list);
      return (): void => {
        stopTracking?.();
        stopWatching?.();
      };
    },
    [trackFocusSource],
  );

  // Measured on the call area: CSS can't size the portalled menu against it.
  const rootElement = useRootElement();
  const [listMaxHeight, setListMaxHeight] = useState<number>();
  const [menuWidth, setMenuWidth] = useState(MENU_WIDTH);
  useEffect(() => {
    if (!menuOpen) return;
    // Followed, since a host can resize the call while the menu is open.
    const subscription = observeElementSize$(rootElement)
      .pipe(
        map(({ width, height }) => ({
          height: Math.max(
            MIN_LIST_HEIGHT,
            Math.round(height * LIST_SHARE_OF_CALL),
          ),
          width: Math.min(MENU_WIDTH, Math.round(width - 2 * MENU_MARGIN)),
        })),
        distinctUntilChanged(
          (a, b) => a.height === b.height && a.width === b.width,
        ),
      )
      .subscribe(({ height, width }) => {
        setListMaxHeight(height);
        setMenuWidth(width);
      });
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

  const showEffects =
    iconsAndLabels === "video" && (backgroundEffects?.length ?? 0) > 0;

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
      {onAddBackgroundImage !== undefined && (
        <input
          ref={watchFileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared, so the same file can be chosen twice in a row.
            e.target.value = "";
            choosingFile.current = false;
            if (file) onAddBackgroundImage(file);
          }}
        />
      )}
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
          ref={watchList}
          // Keeps the items the menu's own children for assistive tech.
          role="none"
          className={styles.deviceList}
          style={
            {
              "--device-list-max-height":
                listMaxHeight === undefined ? undefined : `${listMaxHeight}px`,
              // On a phone Compound renders the menu as a drawer, which sets its own width.
              "--device-list-inline-size": menuIsDrawer()
                ? undefined
                : `${menuWidth}px`,
              "--device-list-scroll-padding-end":
                meterHeight === undefined ? undefined : `${meterHeight}px`,
              "--device-list-scroll-padding-start":
                headingHeight === undefined ? undefined : `${headingHeight}px`,
            } as CSSProperties
          }
        >
          <div
            aria-hidden
            className={classNames(styles.fade, styles.fadeTop)}
          />
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
          {showEffects && (
            <BackgroundEffectGrid
              label={t("settings.background_effects_header")}
              heading={
                <div aria-hidden className={styles.sectionHeading}>
                  <MenuTitle title={t("settings.background_effects_header")} />
                </div>
              }
              effects={backgroundEffects ?? []}
              selected={selectedBackgroundEffect}
              onSelect={onSelectBackgroundEffect}
              settling={backgroundEffectSettling}
              describedBy={
                backgroundEffectNotice === undefined ? undefined : noticeId
              }
              onAdd={
                onAddBackgroundImage === undefined
                  ? undefined
                  : (): void => {
                      choosingFile.current = true;
                      fileInput.current?.click();
                    }
              }
              addLabel={t("action.add_background_image")}
              onRemove={onRemoveBackgroundEffect}
              removeLabel={t("action.remove")}
            />
          )}
          {/* In the list, so the menu grows no taller for it. */}
          {showEffects && refusal !== undefined && (
            <div ref={scrollIntoView} role="none" className={styles.refusal}>
              <Alert
                type="critical"
                title={refusal.text}
                onClose={(): void => setSeenRefusal(refusal)}
              />
            </div>
          )}
          {showEffects &&
            refusal === undefined &&
            backgroundEffectNotice !== undefined && (
              <div id={noticeId} role="none" className={styles.notice}>
                <InfoIcon width={20} height={20} />
                <span>{backgroundEffectNotice}</span>
              </div>
            )}
          <div
            aria-hidden
            className={classNames(styles.fade, styles.fadeBottom)}
          />
        </div>
      </Menu>
    </div>
  );
};

/**
 * Marks on the list whether it has more above and below, for the fades at its
 * edges: the platform may hide its scrollbar until it is used. Set on the
 * element, not rendered, as it changes with every scroll.
 */
function watchScrollEdges(list: HTMLElement): () => void {
  const measure = (): void => {
    const box = list.getBoundingClientRect();
    const above = list.scrollTop > 0;
    // Under the heading stuck at the top, and above the meter at the foot.
    let start = 0;
    if (above)
      for (const heading of list.querySelectorAll(
        `.${styles.sectionHeading}`,
      )) {
        const edge = heading.getBoundingClientRect();
        if (Math.abs(edge.top - box.top) < 2) start = edge.bottom - box.top;
      }
    let end = 0;
    const meter = list.querySelector(`.${styles.stickyMeter}`);
    if (meter !== null) {
      const edge = meter.getBoundingClientRect();
      if (Math.abs(edge.bottom - box.bottom) < 2) end = edge.height;
    }
    list.toggleAttribute("data-more-above", above);
    list.toggleAttribute(
      "data-more-below",
      list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    );
    list.style.setProperty("--device-list-fade-start", `${start}px`);
    list.style.setProperty("--device-list-fade-end", `${end}px`);
  };
  measure();
  list.addEventListener("scroll", measure, { passive: true });
  // The list's own size, and its sections', which change its length.
  const resizes = new ResizeObserver(measure);
  resizes.observe(list);
  for (const section of list.children) resizes.observe(section);
  return (): void => {
    list.removeEventListener("scroll", measure);
    resizes.disconnect();
  };
}

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
