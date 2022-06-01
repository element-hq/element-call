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
}

interface State {
  isHeld: boolean;
  // If the button is being pressed by touch, the ID of that touch
  activeTouchID: number | null;
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
}) => {
  const buttonRef = createRef<HTMLButtonElement>();

  const [{ isHeld, activeTouchID }, setState] = useState<State>({
    isHeld: false,
    activeTouchID: null,
  });
  const onWindowMouseUp = useCallback(
    (e) => {
      if (isHeld) stopTalking();
      setState({ isHeld: false, activeTouchID: null });
    },
    [isHeld, setState, stopTalking]
  );

  const onWindowTouchEnd = useCallback(
    (e: TouchEvent) => {
      // ignore any ended touches that weren't the one pressing the
      // button (bafflingly the TouchList isn't an iterable so we
      // have to do this a really old-school way).
      let touchFound = false;
      for (let i = 0; i < e.changedTouches.length; ++i) {
        if (e.changedTouches.item(i).identifier === activeTouchID) {
          touchFound = true;
          break;
        }
      }
      if (!touchFound) return;

      e.preventDefault();
      if (isHeld) stopTalking();
      setState({ isHeld: false, activeTouchID: null });
    },
    [isHeld, activeTouchID, setState, stopTalking]
  );

  const onButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setState({ isHeld: true, activeTouchID: null });
      startTalking();
    },
    [setState, startTalking]
  );

  const onButtonTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();

      if (isHeld) return;

      setState({
        isHeld: true,
        activeTouchID: e.changedTouches.item(0).identifier,
      });
      startTalking();
    },
    [isHeld, setState, startTalking]
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
    shadow: (Math.max(activeSpeakerVolume, -70) + 70) * 0.5,
    config: {
      clamp: true,
      tension: 300,
    },
  });
  const shadowColor = showTalkOverError
    ? "rgba(255, 91, 85, 0.2)"
    : "rgba(13, 189, 139, 0.2)";

  return (
    <animated.button
      className={classNames(styles.pttButton, {
        [styles.talking]: activeSpeakerUserId,
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
