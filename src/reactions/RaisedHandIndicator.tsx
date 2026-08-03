/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";

import { ReactionIndicator } from "./ReactionIndicator";

export function RaisedHandIndicator({
  raisedHandTime,
  miniature,
  showTimer,
  onClick,
  tabIndex,
}: {
  raisedHandTime?: Date;
  miniature?: boolean;
  showTimer?: boolean;
  onClick?: () => void;
  tabIndex?: number;
}): ReactNode {
  const { t } = useTranslation();
  const [raisedHandDuration, setRaisedHandDuration] = useState("");

  const durationFormatter = useMemo(
    () =>
      new Intl.DurationFormat(undefined, {
        minutesDisplay: "always",
        secondsDisplay: "always",
        hoursDisplay: "auto",
        style: "digital",
      }),
    [],
  );

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
  }, [setRaisedHandDuration, raisedHandTime, showTimer, durationFormatter]);

  if (!raisedHandTime) {
    return;
  }

  const content = (
    <ReactionIndicator emoji="✋" miniature={miniature}>
      {showTimer && <p>{raisedHandDuration}</p>}
    </ReactionIndicator>
  );

  if (onClick) {
    return (
      <button
        aria-label={t("action.lower_hand")}
        style={{
          display: "contents",
          background: "none",
        }}
        onClick={clickCallback}
        tabIndex={tabIndex}
      >
        {content}
      </button>
    );
  }

  return content;
}
