import React from "react";
import { default as RcSlider, SliderProps as RcSliderProps } from "rc-slider";
import "rc-slider/assets/index.css";

interface SliderProps {
  value?: number;
  // onChange: (value: number) => void;
}

export function Slider(props: SliderProps & RcSliderProps) {
  return (
    <RcSlider
      handleStyle={{
        background: "green",
        opacity: 1,
      }}
      {...props}
    />
  );
}
