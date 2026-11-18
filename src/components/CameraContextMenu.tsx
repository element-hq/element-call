/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useId, useRef, type FC, type ReactNode } from "react";
import {
  Alert,
  InlineSpinner,
  MenuScrollSection,
} from "@vector-im/compound-web";
import { InfoIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import styles from "./CameraContextMenu.module.css";
import {
  DeviceMenuList,
  DeviceMenuSection,
  MIN_LIST_HEIGHT,
  type MenuOptions,
  useCallAreaShare,
  usePlannedSelection,
} from "./DeviceMenu";
import { useHoldMenuOpen } from "./MediaButtonWithContextMenu";
import {
  BackgroundEffectGrid,
  type BackgroundEffectGridItem,
} from "./BackgroundEffectGrid";

/** Below the preview, as its stylesheet draws it. */
const PREVIEW_GAP = 12;

export interface CameraContextMenuProps {
  options?: MenuOptions[];
  selectedOption?: string;
  onSelect?: (id: string) => void;
  /** None or an empty list leaves the section out. */
  backgroundEffects?: BackgroundEffectGridItem[];
  selectedBackgroundEffect?: string;
  /** Undefined where effects can't run: all but no effect are disabled. */
  onSelectBackgroundEffect?: (id: string) => void;
  /** What the user should know before choosing an effect, if anything. */
  backgroundEffectNotice?: string;
  /** Whether the first effect chosen is still being prepared. */
  backgroundEffectSettling?: boolean;
  /** Called with the file chosen from the add tile. Omit to leave it out. */
  onAddBackgroundImage?: (file: File) => void;
  /** Removes a removable effect, unless it is the selected one. */
  onRemoveBackgroundEffect?: (id: string) => void;
  /** Why the last file offered couldn't be used, if it couldn't. */
  backgroundImageRefusal?: string;
  onDismissBackgroundImageRefusal?: () => void;
  /** The user's own camera, shown at the top. */
  selfPreview?: ReactNode;
}

/** The camera's menu: a preview, the cameras, then the background effects. */
export const CameraContextMenu: FC<CameraContextMenuProps> = ({
  options = [],
  selectedOption,
  onSelect,
  backgroundEffects = [],
  selectedBackgroundEffect,
  onSelectBackgroundEffect,
  backgroundEffectNotice,
  backgroundEffectSettling,
  onAddBackgroundImage,
  onRemoveBackgroundEffect,
  backgroundImageRefusal,
  onDismissBackgroundImageRefusal,
  selfPreview,
}) => {
  const { t } = useTranslation();
  const noticeId = useId();
  const { requested, plan, settling } = usePlannedSelection({
    input: { options, selected: selectedOption },
  });

  const holdOpen = useHoldMenuOpen();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const watchFileInput = useCallback(
    (input: HTMLInputElement | null): (() => void) | undefined => {
      fileInput.current = input;
      if (input === null) return;
      // Dismissing the picker fires cancel, which React doesn't type.
      const done = (): void => holdOpen(false);
      input.addEventListener("cancel", done);
      return (): void => input.removeEventListener("cancel", done);
    },
    [holdOpen],
  );
  // Scrolled to as it appears, as the list may be scrolled away from it.
  const scrollIntoView = useCallback((element: HTMLElement | null): void => {
    element?.scrollIntoView({ block: "nearest" });
  }, []);

  // Paid for out of the list's share, so a preview makes the menu no taller.
  const share = useCallAreaShare();
  const previewBlock = Math.round((share.menuWidth * 9) / 16) + PREVIEW_GAP;
  const hasPreview = selfPreview !== undefined;
  const previewPinned =
    hasPreview && share.listHeight - previewBlock >= MIN_LIST_HEIGHT;
  const listMaxHeight = Math.max(
    MIN_LIST_HEIGHT,
    share.listHeight - (previewPinned ? previewBlock : 0),
  );
  const preview = hasPreview && (
    <div
      aria-hidden
      className={classNames(styles.selfPreview, {
        [styles.selfPreviewPinned]: previewPinned,
      })}
    >
      {backgroundEffectSettling ? <InlineSpinner size={32} /> : selfPreview}
    </div>
  );

  return (
    <>
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
            holdOpen(false);
            if (file) onAddBackgroundImage(file);
          }}
        />
      )}
      {previewPinned && preview}
      <DeviceMenuList
        maxHeight={listMaxHeight}
        className={classNames({
          [styles.listLeadsWithPreview]: hasPreview && !previewPinned,
        })}
      >
        {hasPreview && !previewPinned && preview}
        <DeviceMenuSection
          title={t("settings.devices.camera")}
          options={options}
          selected={selectedOption}
          onSelect={
            onSelect &&
            ((id): void => {
              plan("input", id);
              onSelect(id);
            })
          }
          numbered={(n) => t("settings.devices.camera_numbered", { n })}
          requested={requested("input")}
          locked={settling}
        />
        {backgroundEffects.length > 0 && (
          <MenuScrollSection title={t("settings.background_effects_header")}>
            <BackgroundEffectGrid
              effects={backgroundEffects}
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
                      holdOpen(true);
                      fileInput.current?.click();
                    }
              }
              addLabel={t("action.add_background_image")}
              onRemove={onRemoveBackgroundEffect}
              removeLabel={t("action.remove")}
            />
            {/* In the list, so the menu grows no taller for it. */}
            {backgroundImageRefusal !== undefined && (
              <div ref={scrollIntoView} role="none" className={styles.refusal}>
                <Alert
                  type="critical"
                  title={backgroundImageRefusal}
                  onClose={onDismissBackgroundImageRefusal}
                />
              </div>
            )}
            {backgroundImageRefusal === undefined &&
              backgroundEffectNotice !== undefined && (
                <div id={noticeId} role="none" className={styles.notice}>
                  <InfoIcon width={20} height={20} />
                  <span>{backgroundEffectNotice}</span>
                </div>
              )}
          </MenuScrollSection>
        )}
      </DeviceMenuList>
    </>
  );
};
