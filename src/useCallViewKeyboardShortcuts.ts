/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useMemo, useRef } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { useEventTarget } from "./useEvents";
import { useRootElement } from "./RootElementContext";
import {
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "./reactions";

/**
 * Whether what has focus is something a key press belongs to, rather than
 * being free for a shortcut: a dialog (the settings, the invite modal, the
 * reaction picker), or anything the user types into.
 *
 * Judged by what the focused element is, not by where it sits in the DOM:
 * Element Call's modals are portalled to whatever it treats as its root, which
 * is the body for the standalone app but a container inside the host's page
 * for the component.
 */
const focusIsClaimed = (): boolean => {
  const active = document.activeElement;
  if (active === null || active === document.body) return false;
  if (active.closest("dialog, [role='dialog']") !== null) return true;
  return isTextEntry(active);
};

const textInputTypes = new Set([
  "text",
  "search",
  "email",
  "url",
  "password",
  "number",
  "tel",
]);

const isTextEntry = (element: Element): boolean => {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement)
    return textInputTypes.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
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
 * Sets up the call's keyboard shortcuts.
 *
 * They are listened for on the element Element Call treats as its root — the
 * page, standalone, or the container a host mounted it in — so that a key
 * pressed anywhere else on a host's page is none of Element Call's business,
 * and two Element Calls on one page each only hear their own. Key presses that
 * belong to something else — a dialog, a text field — are left alone.
 *
 * The following shortcuts are supported (optional):
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
  const rootElement = useRootElement();

  // Listened for on the root rather than on what has focus, so that the user
  // need not focus anything in particular for a shortcut to work: a key pressed
  // with nothing focused reaches the body, which is the root standalone.

  useEventTarget(
    rootElement,
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        logger.info("Keydown event", event);
        if (focusIsClaimed()) return;
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
    // Because this is set on an ancestor, to prevent shortcuts from activating
    // another event callback at the same time, we need to preventDefault
    // *before* child elements receive the event by using capture mode
    useMemo(() => ({ capture: true }), []),
  );

  useEventTarget(
    rootElement,
    "keyup",
    useCallback(
      (event: KeyboardEvent) => {
        if (focusIsClaimed() || !mayReceiveSpaceKeyEvents()) return;
        if (event.key === " ") {
          spacebarHeld.current = false;
          setAudioEnabled?.(false);
        }
      },
      [setAudioEnabled],
    ),
  );

  // Losing the window is what releases a held spacebar, wherever we are in it
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
