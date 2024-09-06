/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, useCallback } from "react";
import { Root, Track, Range, Thumb } from "@radix-ui/react-slider";
import classNames from "classnames";

import styles from "./Slider.module.css";

interface Props {
  className?: string;
  label: string;
  value: number;
  onValueChange: (value: number) => void;
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
  min,
  max,
  step,
  disabled,
}) => {
  const onValueChange = useCallback(
    ([v]: number[]) => onValueChangeProp(v),
    [onValueChangeProp],
  );

  return (
    <Root
      className={classNames(className, styles.slider)}
      value={[value]}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    >
      <Track className={styles.track}>
        <Range className={styles.highlight} />
      </Track>
      <Thumb className={styles.handle} aria-label={label} />
    </Root>
  );
};
