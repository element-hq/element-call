/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The platform on which the application is running.
 */
// The granularity of this value is kind of arbitrary: it distinguishes exactly
// the platforms that the app needs to know about in order to correctly
// implement the designs and work around platform-specific browser weirdness.
// Feel free to increase or decrease that granularity in the future as project
// requirements change.
export let platform: "android" | "ios" | "desktop";

if (/android/i.test(navigator.userAgent)) {
  platform = "android";
  // We include 'Mac' here and double-check for touch support because iPads on
  // iOS 13 pretend to be a MacOS desktop
} else if (
  /iPad|iPhone|iPod|Mac/.test(navigator.userAgent) &&
  "ontouchend" in document
) {
  platform = "ios";
} else {
  platform = "desktop";
}

export const isFirefox = (): boolean => {
  const { userAgent } = navigator;
  return userAgent.includes("Firefox");
};
