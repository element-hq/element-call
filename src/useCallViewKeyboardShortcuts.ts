/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useMemo, useRef } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { useEventTarget } from "./useEvents";
import {
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "./reactions";

/**
 * Determines whether focus is in the same part of the tree as the given
 * element (specifically, if the element or an ancestor of it is focused).
 */
const mayReceiveKeyEvents = (): boolean => {
  const root = document.getElementById("root");
  if (root === null) {
    logger.warn(
      "[mayReceiveKeyEvents] Root element not found, always allow keyboard shortcuts (m,v,esc...)",
    );
    return true;
  }
  const focusElement = document.activeElement;
  const nothingInFocus = focusElement === null;
  const focusOnBody = focusElement === document.body;
  const noPrimaryFocus =
    nothingInFocus || root.contains(focusElement) || focusOnBody;

  logger.warn(
    `[mayReceiveKeyEvents] nothingInFocus ${nothingInFocus}, focusOnBody ${focusOnBody}, noPrimaryFocus ${noPrimaryFocus}`,
  );
  // Only if we do not have a primary focus we allow keyboard shortcut events.
  return noPrimaryFocus;
};

/**
 * Only do push to talk behavior if the active element is not a button or button like.
 */
const mayReceiveSpaceKeyEvents = (): boolean => {
  const activeElement = document.activeElement;
  if (activeElement === null) return true;
  return activeElement.tagName.toLowerCase() !== "button";
};

const KeyToReactionMap: Record<string, ReactionOption> = Object.fromEntries(
  ReactionSet.slice(0, ReactionsRowSize).map((r, i) => [(i + 1).toString(), r]),
);

/**
 * This hook sets up gloabl keyboard shortcuts. It will filter for keyboard presses that should be ignored due to user
 * currently focussing on a modal.
 * This is achieved by using the fact, that all modal inputs are outside the #root element and use react portals to get rendered.
 * The following shortcuts are auspported (optional):
 * @param toggleAudio - triggered on (m)
 * @param toggleVideo - triggered on (v)
 * @param setAudioEnabled - push to talk behavior controlled via (space)
 * @param sendReaction - triggered on (1,2,3,...)
 * @param toggleHandRaised - triggered on (h)
 * Additionally this method listens to the (escape) key to trigger the onBackButtonPressed callback, which is used to navigate to pip in the native app.
 *
 * Note: This function incorrectly assumes that there is a camera and microphone, which is not always the case.
 */
// TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
export function useCallViewKeyboardShortcuts(
  toggleAudio: (() => void) | null,
  toggleVideo: (() => void) | null,
  setAudioEnabled: ((enabled: boolean) => void) | null,
  sendReaction: ((reaction: ReactionOption) => void) | null,
  toggleHandRaised: (() => void) | null,
): void {
  const spacebarHeld = useRef(false);

  // These event handlers are set on the window because we want users to be able
  // to trigger them without going to the trouble of focusing something

  useEventTarget(
    window,
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        logger.info("Keydown event", event);
        if (!mayReceiveKeyEvents()) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          return;

        if (event.key === "m") {
          event.preventDefault();
          toggleAudio?.();
        } else if (event.key === "v") {
          event.preventDefault();
          toggleVideo?.();
        } else if (event.key === " " && mayReceiveSpaceKeyEvents()) {
          event.preventDefault();
          if (!spacebarHeld.current) {
            spacebarHeld.current = true;
            setAudioEnabled?.(true);
          }
        } else if (event.key === "h") {
          event.preventDefault();
          toggleHandRaised?.();
        } else if (KeyToReactionMap[event.key]) {
          event.preventDefault();
          sendReaction?.(KeyToReactionMap[event.key]);
        } else if (event.key === "Escape") {
          logger.info("Escape key pressed, triggering onBackButtonPressed");
          window.controls.onBackButtonPressed?.();
        }
      },
      [
        toggleVideo,
        toggleAudio,
        setAudioEnabled,
        sendReaction,
        toggleHandRaised,
      ],
    ),
    // Because this is set on the window, to prevent shortcuts from activating
    // another event callback at the same time, we need to preventDefault
    // *before* child elements receive the event by using capture mode
    useMemo(() => ({ capture: true }), []),
  );

  useEventTarget(
    window,
    "keyup",
    useCallback(
      (event: KeyboardEvent) => {
        if (!mayReceiveKeyEvents() || !mayReceiveSpaceKeyEvents()) return;
        if (event.key === " ") {
          spacebarHeld.current = false;
          setAudioEnabled?.(false);
        }
      },
      [setAudioEnabled],
    ),
  );

  useEventTarget(
    window,
    "blur",
    useCallback(() => {
      if (spacebarHeld.current) {
        spacebarHeld.current = false;
        setAudioEnabled?.(true);
      }
    }, [setAudioEnabled, spacebarHeld]),
  );
}
