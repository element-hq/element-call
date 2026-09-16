/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ElementCallHostBridge } from "../index";

/**
 * A host bridge that reports everything it is told, so that the harness can
 * watch what Element Call says to its host. (What the host says to Element
 * Call goes through the component's handle, and is logged by the pane.)
 */
export function createDevHostBridge(
  log: (message: string) => void,
  /** What the host does when Element Call asks to be closed. */
  onClose: () => void,
): ElementCallHostBridge {
  /**
   * Records something Element Call told the host. Nothing is sent anywhere, so
   * this is only asynchronous because a real host's answer would have to be.
   */
  const told = async (message: string): Promise<void> => {
    log(`→ ${message}`);
    await Promise.resolve();
  };

  return {
    setAlwaysOnScreen: async (alwaysOnScreen): Promise<void> =>
      await told(`setAlwaysOnScreen(${alwaysOnScreen})`),
    contentLoaded: async (): Promise<void> => await told("contentLoaded"),
    notifyJoined: async (): Promise<void> => await told("notifyJoined"),
    notifyHungUp: async (): Promise<void> => await told("notifyHungUp"),
    notifyDeviceMute: async (state): Promise<void> =>
      await told(
        `notifyDeviceMute(audio: ${state.audio_enabled}, video: ${state.video_enabled})`,
      ),
    // Present because this host really can dismiss Element Call, which is what
    // makes it offer a close affordance at all
    close: async (): Promise<void> => {
      await told("close");
      onClose();
    },
  };
}
