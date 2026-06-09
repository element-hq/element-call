/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

/**
 * Calculates the initial mute state for media devices based on configuration.
 *
 * It is not always possible to start the widget with audio/video unmuted due to privacy concerns.
 * This function encapsulates the logic to determine the appropriate initial state.
 */
export function calculateInitialMuteState(
  skipLobby: boolean,
  callIntent: RTCCallIntent | undefined,
  isWidgetMode: boolean,
): { audioEnabled: boolean; videoEnabled: boolean } {
  logger.debug(
    `calculateInitialMuteState: skipLobby=${skipLobby}, callIntent=${callIntent} isWidgetMode=${isWidgetMode}`,
  );

  if (skipLobby && !isWidgetMode) {
    // If not in widget mode and lobby is skipped, default to muted to protect user privacy.
    // In the SPA context we don't want to unmute users without giving them a chance to adjust their settings first.
    return {
      audioEnabled: false,
      videoEnabled: false,
    };
  }

  // Embedded contexts are trusted environments, so they allow unmuted by default.
  // Same for when showing a lobby, as users can adjust their settings there.
  // Additionally, if the call intent is "audio", we disable video by default.
  return {
    audioEnabled: true,
    videoEnabled: callIntent != "audio",
  };
}
