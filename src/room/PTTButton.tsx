/*
Copyright 2022 New Vector Ltd

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

import React, { useCallback, useState, useRef } from "react";
import classNames from "classnames";
import { useSpring, animated } from "@react-spring/web";
import { logger } from "@sentry/utils";

import styles from "./PTTButton.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { useEventTarget } from "../useEvents";
import { Avatar } from "../Avatar";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { getSetting } from "../settings/useSetting";

interface Props {
  enabled: boolean;
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
  enabled,
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
  const buttonRef = useRef<HTMLButtonElement>();

  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [buttonHeld, setButtonHeld] = useState(false);

  const hold = useCallback(() => {
    // This update is delayed so the user only sees it if latency is significant
    if (buttonHeld) return;
    setButtonHeld(true);
    enqueueNetworkWaiting(true, 100);
    startTalking();
  }, [enqueueNetworkWaiting, startTalking, buttonHeld]);

  const unhold = useCallback(() => {
    if (!buttonHeld) return;
    setButtonHeld(false);
    setNetworkWaiting(false);
    stopTalking();
  }, [setNetworkWaiting, stopTalking, buttonHeld]);

  const onMouseUp = useCallback(() => {
    logger.info("Mouse up event: unholding PTT button");
    unhold();
  }, [unhold]);

  const onBlur = useCallback(() => {
    logger.info("Blur event: unholding PTT button");
    unhold();
  }, [unhold]);

  const onButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      hold();
    },
    [hold]
  );

  // These listeners go on the window so even if the user's cursor / finger
  // leaves the button while holding it, the button stays pushed until
  // they stop clicking / tapping.
  useEventTarget(window, "mouseup", onMouseUp);
  useEventTarget(
    window,
    "touchend",
    useCallback(
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

        logger.info("Touch event ended: unholding PTT button");

        e.preventDefault();
        unhold();
        setActiveTouchId(null);
      },
      [unhold, activeTouchId, setActiveTouchId]
    )
  );

  // This is a native DOM listener too because we want to preventDefault in it
  // to stop also getting a click event, so we need it to be non-passive.
  useEventTarget(
    buttonRef.current,
    "touchstart",
    useCallback(
      (e: TouchEvent) => {
        e.preventDefault();

        hold();
        setActiveTouchId(e.changedTouches.item(0).identifier);
      },
      [hold, setActiveTouchId]
    ),
    { passive: false }
  );

  useEventTarget(
    window,
    "keydown",
    useCallback(
      (e: KeyboardEvent) => {
        if (e.code === "Space") {
          if (!enabled) return;
          // Check if keyboard shortcuts are enabled
          const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
          if (!keyboardShortcuts) {
            return;
          }

          e.preventDefault();

          hold();
        }
      },
      [enabled, hold]
    )
  );
  useEventTarget(
    window,
    "keyup",
    useCallback(
      (e: KeyboardEvent) => {
        if (e.code === "Space") {
          // Check if keyboard shortcuts are enabled
          const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
          if (!keyboardShortcuts) {
            return;
          }

          e.preventDefault();

          logger.info("Keyup event for spacebar: unholding PTT button");

          unhold();
        }
      },
      [unhold]
    )
  );

  // TODO: We will need to disable this for a global PTT hotkey to work
  useEventTarget(window, "blur", onBlur);

  const prefersReducedMotion = usePrefersReducedMotion();
  const { shadow } = useSpring({
    immediate: prefersReducedMotion,
    shadow: prefersReducedMotion
      ? activeSpeakerUserId
        ? 17
        : 0
      : (Math.max(activeSpeakerVolume, -70) + 70) * 0.6,
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
