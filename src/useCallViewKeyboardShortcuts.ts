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

import { useCallback, useRef } from "react";

import { getSetting } from "./settings/useSetting";
import { useEventTarget } from "./useEvents";

export function useCallViewKeyboardShortcuts(
  enabled: boolean,
  toggleMicrophoneMuted: () => void,
  toggleLocalVideoMuted: () => void,
  setMicrophoneMuted: (muted: boolean) => void
) {
  const spacebarHeld = useRef(false);

  useEventTarget(
    window,
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        if (!enabled) return;
        // Check if keyboard shortcuts are enabled
        const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
        if (!keyboardShortcuts) {
          return;
        }

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
        enabled,
        spacebarHeld,
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
        if (!enabled) return;
        // Check if keyboard shortcuts are enabled
        const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
        if (!keyboardShortcuts) {
          return;
        }

        if (event.key === " ") {
          spacebarHeld.current = false;
          setMicrophoneMuted(true);
        }
      },
      [enabled, setMicrophoneMuted]
    )
  );

  useEventTarget(
    window,
    "blur",
    useCallback(() => {
      if (spacebarHeld) {
        spacebarHeld.current = false;
        setMicrophoneMuted(true);
      }
    }, [setMicrophoneMuted, spacebarHeld])
  );
}
