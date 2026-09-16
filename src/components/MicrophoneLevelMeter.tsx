/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { Text } from "@vector-im/compound-web";
import { MicOnIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import styles from "./MicrophoneLevelMeter.module.css";
import { METER_SEGMENTS, type MicrophoneState } from "../state/MicrophoneLevel";

interface Props {
  state: MicrophoneState;
  className?: string;
}

/**
 * The live input level of the selected microphone, shown beneath it.
 *
 * It says whether the microphone is picking anything up, which is not the same
 * as whether the user is being heard: it keeps moving while muted, and the mute
 * control is what says nothing is transmitted.
 */
export const MicrophoneLevelMeter: FC<Props> = ({ state, className }) => {
  const { t } = useTranslation();

  if (state.type !== "level")
    return (
      <div className={classNames(styles.meter, className)}>
        <MicOnIcon width={24} height={24} className={styles.icon} aria-hidden />
        <Text size="sm" className={styles.message}>
          {state.type === "permission-denied"
            ? t("microphone_level.permission_denied")
            : t("microphone_level.no_device")}
        </Text>
      </div>
    );

  return (
    <div className={classNames(styles.meter, className)}>
      <MicOnIcon width={24} height={24} className={styles.icon} aria-hidden />
      <div
        className={styles.segments}
        role="meter"
        aria-label={t("microphone_level.label")}
        aria-valuemin={0}
        aria-valuemax={METER_SEGMENTS}
        aria-valuenow={state.level}
        aria-valuetext={t("microphone_level.value", {
          level: state.level,
          max: METER_SEGMENTS,
        })}
      >
        {Array.from({ length: METER_SEGMENTS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={classNames(styles.segment, {
              [styles.segmentLit]: i < state.level,
            })}
          />
        ))}
      </div>
    </div>
  );
};
