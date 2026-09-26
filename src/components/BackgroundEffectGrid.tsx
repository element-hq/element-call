/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, type ReactElement } from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@radix-ui/react-dropdown-menu";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { InlineSpinner } from "@vector-im/compound-web";
import {
  BlockIcon,
  BlurIcon,
  CheckCircleSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./BackgroundEffectGrid.module.css";
import { menuIsDrawer } from "./menuIsDrawer";

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
  // On a phone Compound renders the menu as a drawer, outside Radix, where a
  // Radix item can't mount.
  const inDrawer = menuIsDrawer();

  const tiles = effects.map((effect) => {
    const checked = effect.id === selected;
    const disabled = onSelect === undefined && effect.kind !== "none";
    const content = (
      <TileContent
        effect={effect}
        checked={checked}
        settling={checked && settling}
      />
    );
    return inDrawer ? (
      <button
        key={effect.id}
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        aria-busy={checked && settling}
        disabled={disabled}
        data-disabled={disabled ? "" : undefined}
        className={styles.tile}
        onClick={(): void => choose(effect.id)}
      >
        {content}
      </button>
    ) : (
      <DropdownMenuRadioItem
        key={effect.id}
        value={effect.id}
        textValue={effect.label}
        aria-busy={checked && settling}
        disabled={disabled}
        className={styles.tile}
        // Kept open, so the user sees what they chose take effect.
        onSelect={(e) => e.preventDefault()}
      >
        {content}
      </DropdownMenuRadioItem>
    );
  });

  const body = (
    <>
      {heading}
      <div role="none" className={styles.grid}>
        {tiles}
      </div>
    </>
  );
  return inDrawer ? (
    <div role="group" aria-label={label} aria-describedby={describedBy}>
      {body}
    </div>
  ) : (
    <DropdownMenuRadioGroup
      aria-label={label}
      aria-describedby={describedBy}
      value={selected}
      onValueChange={choose}
    >
      {body}
    </DropdownMenuRadioGroup>
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
