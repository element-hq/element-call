/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import "matrix-js-sdk/src/@types/global";
import type { DurationFormat as PolyfillDurationFormat } from "@formatjs/intl-durationformat";
import { Controls } from "../controls";

declare global {
  interface Document {
    // Safari only supports this prefixed, so tell the type system about it
    webkitExitFullscreen: () => void;
    webkitFullscreenElement: HTMLElement | null;
  }

  interface Window {
    controls: Controls;
  }

  interface HTMLElement {
    // Safari only supports this prefixed, so tell the type system about it
    webkitRequestFullscreen: () => void;
  }

  namespace Intl {
    // Add DurationFormat as part of the Intl namespace because we polyfill it
    const DurationFormat: typeof PolyfillDurationFormat;
  }
}
