import classNames from "classnames";
import React from "react";

import { Slider } from "../input/Slider";
import useCurrentVolume from "./useCurrentVolume";
import { useVoiceActivationTreshold } from "./useSetting";
import styles from "./VoiceActivationTresholdSlider.module.css";

export function VoiceActivationTresholdSlider() {
  const [treshold, setTreshold] = useVoiceActivationTreshold();

  return (
    <div className={styles.container}>
      <VolumeIndicator treshold={treshold} />
      <Slider
        min={-100}
        max={0}
        step={1}
        defaultValue={treshold}
        onChange={setTreshold}
      />
    </div>
  );
}

function VolumeIndicator({ treshold }: { treshold: number }) {
  const { volume } = useCurrentVolume();
  const volumePercentage = Math.min(Math.max(volume + 100, 0), 100);

  return (
    <div
      className={classNames(
        styles.volumeIndicator,
        { [styles.green]: volume >= treshold },
        { [styles.red]: volume < treshold }
      )}
      style={{
        width: volumePercentage + "%",
      }}
    />
  );
}
