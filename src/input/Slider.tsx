import React, { ChangeEvent } from "react";

import "rc-slider/assets/index.css";
import styles from "./Slider.module.css";

interface SliderProps {
  value?: number;
  onChange: (value: number) => void;
  defaultValue?: number;
  step?: number;
  min?: number;
  max?: number;
}

export function Slider({
  value,
  onChange,
  defaultValue,
  step = 0.01,
  min = 0,
  max = 1,
}: SliderProps) {
  const handleOnChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value: number = +event.target.value;
    onChange(value);
  };

  return (
    <input
      className={styles.slider}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={defaultValue}
      value={value}
      onChange={handleOnChange}
    />
  );
}
