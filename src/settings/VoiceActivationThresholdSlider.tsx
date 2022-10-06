/*
Copyright 2021 Hugo Hutri <hugo.hutri98@gmail.com>

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

import classNames from "classnames";
import React from "react";

import { Slider } from "../input/Slider";
import useCurrentVolume from "./useCurrentVolume";
import { useVoiceActivationThreshold } from "./useSetting";
import styles from "./VoiceActivationThresholdSlider.module.css";

export function VoiceActivationThresholdSlider({
  enabled,
}: {
  enabled: boolean;
}) {
  const [threshold, setThreshold] = useVoiceActivationThreshold();

  return (
    <div
      className={styles.container}
      style={{
        opacity: enabled ? 1 : 0.25,
        pointerEvents: enabled ? "initial" : "none",
      }}
    >
      <VolumeIndicator threshold={threshold} />
      <Slider
        min={-100}
        max={0}
        step={1}
        defaultValue={threshold}
        onChange={setThreshold}
        translucent
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
