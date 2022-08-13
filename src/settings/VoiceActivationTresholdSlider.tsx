import React from "react";

import { Slider } from "../input/Slider";
import { useVoiceActivationTreshold } from "./useSetting";

export function VoiceActivationTresholdSlider() {
  const [treshold, setTreshold] = useVoiceActivationTreshold();

  return (
    <div style={{ width: 444 }}>
      <Slider
        min={-100}
        max={0}
        step={1}
        defaultValue={treshold}
        onChange={setTreshold}
      />
      {/* <input
        type="range"
        min="-100"
        max="0"
        step="1"
        defaultValue={treshold}
        onChange={(e) => {
          const newValue = +e.target.value;
          setTreshold(newValue);
        }}
      /> */}
    </div>
  );
}
