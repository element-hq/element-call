/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MicOnIcon,
  MicOffIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import styles from "./AudioLevelMeter.module.css";
import { type MicrophoneLevelState } from "./useMicrophoneLevel";

// The bars share the row evenly, so the count is what sets their width: more
// bars means thinner ones, and a finer-grained reading of the level.
const BAR_COUNT = 18;
/**
 * Level below which the meter reads as silent. Above the noise floor of a
 * typical desk microphone, so an idle room does not announce itself as sound.
 */
const SPEECH_THRESHOLD = 0.06;

export interface AudioLevelMeterProps {
  state: MicrophoneLevelState;
}

/**
 * A live indicator of the signal level at the selected microphone.
 *
 * Focusable, so that a screen reader user can put it in focus and hear whether
 * the microphone is picking anything up; the bars alone carry that information
 * for everyone else.
 */
export const AudioLevelMeter: FC<AudioLevelMeterProps> = ({ state }) => {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  if (state.type === "denied")
    return (
      <div className={styles.message} data-testid="mic_level_denied">
        <MicOffIcon width={24} height={24} aria-hidden />
        <span>{t("audio_menu.mic_permission_denied")}</span>
      </div>
    );

  const unavailable = state.type === "unavailable";
  const level = state.type === "active" ? state.level : 0;
  const litBars = unavailable ? 0 : Math.round(level * BAR_COUNT);
  const speaking = !unavailable && level >= SPEECH_THRESHOLD;
  const stateText = unavailable
    ? t("audio_menu.mic_unavailable")
    : speaking
      ? t("audio_menu.mic_level_active")
      : t("audio_menu.mic_level_silent");

  return (
    <div
      className={classNames(styles.meter, {
        [styles.unavailable]: unavailable,
      })}
      data-testid="mic_level_meter"
      data-unavailable={unavailable || undefined}
      role="meter"
      // The meter is the only place the "is my microphone working?" answer
      // lives, so it has to be reachable without a pointer even though a
      // meter is not an interactive control.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={t("audio_menu.mic_level_label")}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={level}
      aria-valuetext={stateText}
    >
      <MicOnIcon width={24} height={24} className={styles.icon} aria-hidden />
      <div className={styles.bars}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={classNames(styles.bar, { [styles.lit]: i < litBars })}
          />
        ))}
      </div>
      {/* Only announces while the meter holds focus, so the level does not
          interrupt a screen reader reading the rest of the menu. */}
      <span className={styles.srOnly} aria-live="polite">
        {focused ? stateText : ""}
      </span>
    </div>
  );
};
