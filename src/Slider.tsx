/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback } from "react";
import { Root, Track, Range, Thumb } from "@radix-ui/react-slider";
import classNames from "classnames";
import { Tooltip } from "@vector-im/compound-web";

import styles from "./Slider.module.css";

interface Props {
  className?: string;
  label: string;
  value: number;
  /**
   * Event handler called when the value changes during an interaction.
   */
  onValueChange: (value: number) => void;
  /**
   * Event handler called when the value changes at the end of an interaction.
   * Useful when you only need to capture a final value to update a backend
   * service, or when you want to remember the last value that the user
   * "committed" to.
   */
  onValueCommit?: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}

/**
 * A slider control allowing a value to be selected from a range.
 */
export const Slider: FC<Props> = ({
  className,
  label,
  value,
  onValueChange: onValueChangeProp,
  onValueCommit: onValueCommitProp,
  min,
  max,
  step,
  disabled,
}) => {
  const onValueChange = useCallback(
    ([v]: number[]) => onValueChangeProp(v),
    [onValueChangeProp],
  );
  const onValueCommit = useCallback(
    ([v]: number[]) => onValueCommitProp?.(v),
    [onValueCommitProp],
  );

  return (
    <Root
      className={classNames(className, styles.slider)}
      value={[value]}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    >
      <Track className={styles.track}>
        <Range className={styles.highlight} />
      </Track>
      {/* Note: This is expected not to be visible on mobile.*/}
      <Tooltip placement="top" label={Math.round(value * 100).toString() + "%"}>
        <Thumb className={styles.handle} aria-label={label} />
      </Tooltip>
    </Root>
  );
};
