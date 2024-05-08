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

import { Focus } from "matrix-js-sdk/src/matrixrtc/focus";

export interface LivekitFocus extends Focus {
  type: "livekit";
  livekit_service_url: string;
  livekit_alias: string;
}

export interface LivekitFocusConfig extends Focus {
  type: "livekit";
  livekit_service_url: string;
}

export interface LivekitFocusActive extends Focus {
  type: "livekit";
  selection: "oldest_membership";
}

export function isLivekitFocus(object: Focus): object is LivekitFocus {
  return (
    object.type === "livekit" &&
    "livekit_service_url" in object &&
    "livekit_alias" in object
  );
}

export function isLivekitFocusConfig(
  object: Focus,
): object is LivekitFocusConfig {
  return object.type === "livekit" && "livekit_service_url" in object;
}
