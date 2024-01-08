/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
