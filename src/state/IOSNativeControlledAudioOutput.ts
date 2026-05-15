/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { map, startWith } from "rxjs";

import { currentRoute$, type Controls } from "../controls.ts";
import { type Behavior, constant } from "./Behavior.ts";
import type { ObservableScope } from "./ObservableScope.ts";
import {
  type AudioOutputDeviceLabel,
  type MediaDevice,
  type SelectedAudioOutputDevice,
} from "./MediaDevices.ts";

/**
 * A special implementation of audio output that allows the hosting application
 * to have more control over the device selection process. This is used when the
 * `controlledAudioDevices` URL parameter is set, which is currently only true on mobile.
 */
export class IOSNativeControlledAudioOutput implements MediaDevice<
  AudioOutputDeviceLabel,
  SelectedAudioOutputDevice
> {
  private logger = rootLogger.getChild(
    "[MediaDevices IOSNativeControlledAudioOutput]",
  );

  public readonly available$: Behavior<Map<string, AudioOutputDeviceLabel>> =
    constant(new Map());

  public select(id: string): void {
    this.controls.showNativeAudioDevicePicker?.();
  }

  public readonly selected$ = this.scope.behavior(
    currentRoute$.pipe(
      startWith(null),
      map((route) => {
        if (!route) return undefined;
        this.logger.debug(`Selected ${route?.type}`);
        return {
          id: route.type,
        } as SelectedAudioOutputDevice;
      }),
    ),
  );

  public constructor(
    private readonly controls: Controls,
    private readonly scope: ObservableScope,
  ) {}
}
