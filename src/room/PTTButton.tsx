/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { useCallback, useEffect, useState, createRef } from "react";
import classNames from "classnames";
import { useSpring, animated } from "@react-spring/web";

import styles from "./PTTButton.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { Avatar } from "../Avatar";

interface Props {
  showTalkOverError: boolean;
  activeSpeakerUserId: string;
  activeSpeakerDisplayName: string;
  activeSpeakerAvatarUrl: string;
  activeSpeakerIsLocalUser: boolean;
  activeSpeakerVolume: number;
  size: number;
  startTalking: () => void;
  stopTalking: () => void;
  networkWaiting: boolean;
  enqueueNetworkWaiting: (value: boolean, delay: number) => void;
  setNetworkWaiting: (value: boolean) => void;
}

export const PTTButton: React.FC<Props> = ({
  showTalkOverError,
  activeSpeakerUserId,
  activeSpeakerDisplayName,
  activeSpeakerAvatarUrl,
  activeSpeakerIsLocalUser,
  activeSpeakerVolume,
  size,
  startTalking,
  stopTalking,
  networkWaiting,
  enqueueNetworkWaiting,
  setNetworkWaiting,
}) => {
  const buttonRef = createRef<HTMLButtonElement>();

  const [held, setHeld] = useState(false);
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);

  const hold = useCallback(() => {
    setHeld(true);
    // This update is delayed so the user only sees it if latency is significant
    enqueueNetworkWaiting(true, 100);
  }, [setHeld, enqueueNetworkWaiting]);
  const unhold = useCallback(() => {
    setHeld(false);
    setNetworkWaiting(false);
  }, [setHeld, setNetworkWaiting]);

  const onWindowMouseUp = useCallback(
    (e) => {
      if (held) stopTalking();
      unhold();
    },
    [held, unhold, stopTalking]
  );

  const onWindowTouchEnd = useCallback(
    (e: TouchEvent) => {
      // ignore any ended touches that weren't the one pressing the
      // button (bafflingly the TouchList isn't an iterable so we
      // have to do this a really old-school way).
      let touchFound = false;
      for (let i = 0; i < e.changedTouches.length; ++i) {
        if (e.changedTouches.item(i).identifier === activeTouchId) {
          touchFound = true;
          break;
        }
      }
      if (!touchFound) return;

      e.preventDefault();
      if (held) stopTalking();
      unhold();
      setActiveTouchId(null);
    },
    [held, activeTouchId, unhold, stopTalking]
  );

  const onButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      hold();
      startTalking();
    },
    [hold, startTalking]
  );

  const onButtonTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();

      if (!held) {
        hold();
        setActiveTouchId(e.changedTouches.item(0).identifier);
        startTalking();
      }
    },
    [held, hold, startTalking]
  );

  useEffect(() => {
    const currentButtonElement = buttonRef.current;

    // These listeners go on the window so even if the user's cursor / finger
    // leaves the button while holding it, the button stays pushed until
    // they stop clicking / tapping.
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("touchend", onWindowTouchEnd);
    // This is a native DOM listener too because we want to preventDefault in it
    // to stop also getting a click event, so we need it to be non-passive.
    currentButtonElement.addEventListener("touchstart", onButtonTouchStart, {
      passive: false,
    });

    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("touchend", onWindowTouchEnd);
      currentButtonElement.removeEventListener(
        "touchstart",
        onButtonTouchStart
      );
    };
  }, [onWindowMouseUp, onWindowTouchEnd, onButtonTouchStart, buttonRef]);

  const { shadow } = useSpring({
    shadow: (Math.max(activeSpeakerVolume, -70) + 70) * 0.6,
    config: {
      clamp: true,
      tension: 300,
    },
  });
  const shadowColor = showTalkOverError
    ? "var(--alert-20)"
    : networkWaiting
    ? "var(--tertiary-content-20)"
    : "var(--accent-20)";

  return (
    <animated.button
      className={classNames(styles.pttButton, {
        [styles.talking]: activeSpeakerUserId,
        [styles.networkWaiting]: networkWaiting,
        [styles.error]: showTalkOverError,
      })}
      style={{
        boxShadow: shadow.to(
          (s) =>
            `0px 0px 0px ${s}px ${shadowColor}, 0px 0px 0px ${
              2 * s
            }px ${shadowColor}`
        ),
      }}
      onMouseDown={onButtonMouseDown}
      ref={buttonRef}
    >
      {activeSpeakerIsLocalUser || !activeSpeakerUserId ? (
        <MicIcon
          className={styles.micIcon}
          width={size / 3}
          height={size / 3}
        />
      ) : (
        <Avatar
          key={activeSpeakerUserId}
          size={size - 12}
          src={activeSpeakerAvatarUrl}
          fallback={activeSpeakerDisplayName.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
      )}
    </animated.button>
  );
};
