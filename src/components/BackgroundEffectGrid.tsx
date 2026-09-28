/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type KeyboardEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@radix-ui/react-dropdown-menu";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { InlineSpinner, Tooltip } from "@vector-im/compound-web";
import {
  BlockIcon,
  BlurIcon,
  CheckCircleSolidIcon,
  CloseIcon,
  PlusIcon,
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
  /** Whether it is the user's to remove. */
  removable?: boolean;
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
  /** Offers to add a background of one's own. Omit to leave that tile out. */
  onAdd?: () => void;
  addLabel?: string;
  /** Removes a removable one, never the one in force. Omit to offer none. */
  onRemove?: (id: string) => void;
  removeLabel?: string;
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
  onAdd,
  addLabel,
  onRemove,
  removeLabel,
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
    const remove =
      effect.removable && !checked && onRemove !== undefined
        ? (): void => onRemove(effect.id)
        : undefined;
    const removeProps =
      remove === undefined
        ? {}
        : {
            "aria-keyshortcuts": "Delete",
            onKeyDown: (e: KeyboardEvent): void => {
              if (e.key !== "Delete" && e.key !== "Backspace") return;
              e.preventDefault();
              remove();
            },
          };
    const content = (
      <TileContent
        effect={effect}
        checked={checked}
        settling={checked && settling}
      />
    );
    const tile = inDrawer ? (
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
        {...removeProps}
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
        {...removeProps}
      >
        {content}
      </DropdownMenuRadioItem>
    );
    if (remove === undefined) return tile;
    // Beside the item, not in it: inside, the item takes the press first and
    // the tile is chosen instead.
    return (
      <div key={effect.id} className={styles.removable}>
        {tile}
        <Tooltip label={removeLabel ?? ""}>
          {/* Not a control of its own, so the menu keeps one keyboard model:
              the keyboard reaches the same action through Delete. */}
          <span aria-hidden className={styles.remove} onClick={remove}>
            <CloseIcon width={20} height={20} />
          </span>
        </Tooltip>
      </div>
    );
  });

  // A command rather than a choice, so an item beside the radios.
  const addContent = (
    <>
      <span aria-hidden className={styles.swatch}>
        <PlusIcon width={24} height={24} />
      </span>
      <VisuallyHidden>{addLabel}</VisuallyHidden>
    </>
  );
  const addTile =
    onAdd === undefined ? null : inDrawer ? (
      <button
        type="button"
        role="menuitem"
        className={styles.tile}
        onClick={onAdd}
      >
        {addContent}
      </button>
    ) : (
      <DropdownMenuItem
        textValue={addLabel}
        className={styles.tile}
        onSelect={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        {addContent}
      </DropdownMenuItem>
    );

  const body = (
    <>
      {heading}
      <div role="none" className={styles.grid}>
        {tiles}
        {addTile}
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
