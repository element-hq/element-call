/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  MouseEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import classNames from "classnames";
import "@formatjs/intl-durationformat/polyfill";
import { DurationFormat } from "@formatjs/intl-durationformat";

import styles from "./RaisedHandIndicator.module.css";

const durationFormatter = new DurationFormat(undefined, {
  minutesDisplay: "always",
  secondsDisplay: "always",
  hoursDisplay: "auto",
  style: "digital",
});

export function RaisedHandIndicator({
  raisedHandTime,
  minature,
  showTimer,
  onClick,
}: {
  raisedHandTime?: Date;
  minature?: boolean;
  showTimer?: boolean;
  onClick?: () => void;
}): ReactNode {
  const [raisedHandDuration, setRaisedHandDuration] = useState("");

  const clickCallback = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      if (!onClick) {
        return;
      }
      event.preventDefault();
      onClick();
    },
    [onClick],
  );

  // This effect creates a simple timer effect.
  useEffect(() => {
    if (!raisedHandTime || !showTimer) {
      return;
    }

    const calculateTime = (): void => {
      const totalSeconds = Math.ceil(
        (new Date().getTime() - raisedHandTime.getTime()) / 1000,
      );
      setRaisedHandDuration(
        durationFormatter.format({
          seconds: totalSeconds % 60,
          minutes: Math.floor(totalSeconds / 60),
        }),
      );
    };
    calculateTime();
    const to = setInterval(calculateTime, 1000);
    return (): void => clearInterval(to);
  }, [setRaisedHandDuration, raisedHandTime, showTimer]);

  if (!raisedHandTime) {
    return;
  }

  const content = (
    <div
      className={classNames(styles.raisedHandWidget, {
        [styles.raisedHandWidgetLarge]: !minature,
      })}
    >
      <div
        className={classNames(styles.raisedHand, {
          [styles.raisedHandLarge]: !minature,
        })}
      >
        <span role="img" aria-label="raised hand">
          ✋
        </span>
      </div>
      {showTimer && <p>{raisedHandDuration}</p>}
    </div>
  );

  if (onClick) {
    return (
      <button
        aria-label="lower raised hand"
        className={styles.button}
        onClick={clickCallback}
      >
        {content}
      </button>
    );
  }

  return content;
}
