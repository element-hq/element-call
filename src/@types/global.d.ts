/*
Copyright 2022 New Vector Ltd

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

import "matrix-js-sdk/src/@types/global";
import { Controls } from "../controls";

type VideoPresentationMode = "inline" | "picture-in-picture" | "fullscreen";

declare global {
  interface Document {
    // Safari only supports this prefixed, so tell the type system about it
    webkitExitFullscreen: () => void;
    webkitFullscreenElement: HTMLElement | null;
  }

  interface Window {
    // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
    OLM_OPTIONS: Record<string, string>;
    controls: Controls;
  }

  interface HTMLElement {
    // Safari only supports this prefixed, so tell the type system about it
    webkitRequestFullscreen: () => void;
  }

  interface HTMLVideoElement {
    webkitSetPresentationMode: (mode: VideoPresentationMode) => void;
  }
}
