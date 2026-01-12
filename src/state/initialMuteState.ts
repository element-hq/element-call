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
  packageType: "full" | "embedded",
  hostname: string | undefined = undefined,
  trustLocalhost: boolean = false,
): { audioEnabled: boolean; videoEnabled: boolean } {

  logger.debug(
    `calculateInitialMuteState: skipLobby=${skipLobby}, callIntent=${callIntent}, hostname=${hostname}, trustLocalhost=${trustLocalhost}`,
  );

  const isTrustedHost =
    packageType == "embedded" ||
    // Trust local hosts in dev mode to make local testing easier
    (hostname == "localhost" && trustLocalhost);

  if (skipLobby && !isTrustedHost) {
    // If host not trusted and lobby skipped, default to muted to protect user privacy.
    // This prevents users from inadvertently joining with active audio/video
    // when browser permissions were previously granted in a different context.
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
