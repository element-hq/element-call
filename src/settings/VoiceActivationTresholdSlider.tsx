import classNames from "classnames";
import React from "react";

import { Slider } from "../input/Slider";
import useCurrentVolume from "./useCurrentVolume";
import { useVoiceActivationThreshold } from "./useSetting";
import styles from "./VoiceActivationThresholdSlider.module.css";

export function VoiceActivationThresholdSlider() {
  const [threshold, setThreshold] = useVoiceActivationThreshold();

  return (
    <div className={styles.container}>
      <VolumeIndicator threshold={threshold} />
      <Slider
        min={-100}
        max={0}
        step={1}
        defaultValue={threshold}
        onChange={setThreshold}
      />
    </div>
  );
}

function VolumeIndicator({ threshold }: { threshold: number }) {
  const { volume } = useCurrentVolume();
  const volumePercentage = Math.min(Math.max(volume + 100, 0), 100);

  return (
    <div
      className={classNames(
        styles.volumeIndicator,
        { [styles.green]: volume >= threshold },
        { [styles.red]: volume < threshold }
      )}
      style={{
        width: volumePercentage + "%",
      }}
    />
  );
}
