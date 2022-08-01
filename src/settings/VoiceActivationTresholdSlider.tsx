import React from "react";

import { Slider } from "../input/Slider";
import { useVoiceActivationTreshold } from "./useSetting";

export function VoiceActivationTresholdSlider() {
  const [treshold, setTreshold] = useVoiceActivationTreshold();

  return (
    <div style={{ width: 200 }}>
      <Slider
        min={-100}
        max={0}
        defaultValue={treshold}
        onChange={setTreshold}
      />
    </div>
  );
}
