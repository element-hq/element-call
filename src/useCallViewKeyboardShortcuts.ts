/*
Copyright 2022-2023 New Vector Ltd

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

import { RefObject, useCallback, useRef } from "react";

import { useEventTarget } from "./useEvents";

/**
 * Determines whether focus is in the same part of the tree as the given
 * element (specifically, if an ancestor or descendant of it is focused).
 */
const mayReceiveKeyEvents = (e: HTMLElement): boolean => {
  const focusedElement = document.activeElement;
  return (
    focusedElement !== null &&
    (focusedElement.contains(e) || e.contains(focusedElement))
  );
};

export function useCallViewKeyboardShortcuts(
  focusElement: RefObject<HTMLElement | null>,
  toggleMicrophoneMuted: () => void,
  toggleLocalVideoMuted: () => void,
  setMicrophoneMuted: (muted: boolean) => void
) {
  const spacebarHeld = useRef(false);

  // These event handlers are set on the window because we want users to be able
  // to trigger them without going to the trouble of focusing something

  useEventTarget(
    window,
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        if (focusElement.current === null) return;
        if (!mayReceiveKeyEvents(focusElement.current)) return;

        if (event.key === "m") {
          toggleMicrophoneMuted();
        } else if (event.key == "v") {
          toggleLocalVideoMuted();
        } else if (event.key === " " && !spacebarHeld.current) {
          spacebarHeld.current = true;
          setMicrophoneMuted(false);
        }
      },
      [
        focusElement,
        toggleLocalVideoMuted,
        toggleMicrophoneMuted,
        setMicrophoneMuted,
      ]
    )
  );

  useEventTarget(
    window,
    "keyup",
    useCallback(
      (event: KeyboardEvent) => {
        if (focusElement.current === null) return;
        if (!mayReceiveKeyEvents(focusElement.current)) return;

        if (event.key === " ") {
          spacebarHeld.current = false;
          setMicrophoneMuted(true);
        }
      },
      [focusElement, setMicrophoneMuted]
    )
  );

  useEventTarget(
    window,
    "blur",
    useCallback(() => {
      if (spacebarHeld.current) {
        spacebarHeld.current = false;
        setMicrophoneMuted(true);
      }
    }, [setMicrophoneMuted, spacebarHeld])
  );
}
