/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, type ReactElement } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { InlineSpinner, MenuItem } from "@vector-im/compound-web";
import {
  BlockIcon,
  BlurIcon,
  CheckCircleSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./BackgroundEffectGrid.module.css";

/** One choice in the camera menu's Background effects section. */
export interface BackgroundEffectOption {
  id: string;
  /** The tile's accessible name; drawn only where the tile has no picture. */
  label: string;
  kind: "none" | "blur" | "image";
  /** For kind "image". */
  imageUrl?: string;
}

interface Props {
  /** Names the group, whose heading is hidden from assistive technology. */
  label: string;
  heading: ReactNode;
  effects: BackgroundEffectOption[];
  selected: string | undefined;
  /** Undefined where effects can't run: all but no effect are disabled. */
  onSelect: ((id: string) => void) | undefined;
  /** Shown on the selected tile until its effect is on screen. */
  settling?: boolean;
  /** Id of the text saying what the user should know before choosing. */
  describedBy?: string;
}

/**
 * The background effects as a grid of tiles: one radio choice, walked by the
 * menu's arrow keys like the device rows.
 */
export const BackgroundEffectGrid: FC<Props> = ({
  label,
  heading,
  effects,
  selected,
  onSelect,
  settling = false,
  describedBy,
}) => {
  const choose = (id: string): void => {
    if (id !== selected) onSelect?.(id);
  };
  const tiles = effects.map((effect) => {
    const checked = effect.id === selected;
    const disabled = onSelect === undefined && effect.kind !== "none";
    return (
      <MenuItem
        key={effect.id}
        role="menuitemradio"
        aria-checked={checked}
        aria-busy={checked && settling}
        disabled={disabled}
        data-disabled={disabled ? "" : undefined}
        label={null}
        hideChevron
        className={styles.tile}
        // Without a handler it isn't one of the menu's items, so the keyboard
        // passes over it.
        onSelect={
          disabled
            ? null
            : (e): void => {
                // Kept open, so the user sees what they chose take effect.
                e.preventDefault();
                choose(effect.id);
              }
        }
      >
        <TileContent
          effect={effect}
          checked={checked}
          settling={checked && settling}
        />
      </MenuItem>
    );
  });

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy}>
      {heading}
      <div role="none" className={styles.grid}>
        {tiles}
      </div>
    </div>
  );
};

function TileContent({
  effect,
  checked,
  settling,
}: {
  effect: BackgroundEffectOption;
  checked: boolean;
  settling: boolean;
}): ReactElement {
  return (
    <>
      <span aria-hidden className={styles.swatch}>
        {effect.kind === "image" && (
          <img className={styles.picture} src={effect.imageUrl} alt="" />
        )}
        {settling ? (
          <span className={styles.mark}>
            <InlineSpinner size={20} />
          </span>
        ) : checked ? (
          <CheckCircleSolidIcon
            className={styles.mark}
            width={20}
            height={20}
          />
        ) : effect.kind === "none" ? (
          <BlockIcon width={20} height={20} />
        ) : effect.kind === "blur" ? (
          <BlurIcon width={20} height={20} />
        ) : null}
      </span>
      {effect.kind === "image" ? (
        <VisuallyHidden>{effect.label}</VisuallyHidden>
      ) : (
        <span className={styles.label}>{effect.label}</span>
      )}
    </>
  );
}
