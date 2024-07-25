/*
Copyright 2023 New Vector Ltd

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
