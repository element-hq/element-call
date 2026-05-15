/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { combineLatest, merge, startWith, Subject, tap } from "rxjs";

import {
  availableOutputDevices$ as controlledAvailableOutputDevices$,
  outputDevice$ as controlledOutputSelection$,
} from "../controls.ts";
import type { Behavior } from "./Behavior.ts";
import type { ObservableScope } from "./ObservableScope.ts";
import {
  type AudioOutputDeviceLabel,
  availableRawDevices$,
  iosDeviceMenu$,
  type MediaDevice,
  type SelectedAudioOutputDevice,
} from "./MediaDevices.ts";

// This hardcoded id is used in EX ios! It can only be changed in coordination with
// the ios swift team.
const EARPIECE_CONFIG_ID = "earpiece-id";

/**
 * A special implementation of audio output that allows the hosting application
 * to have more control over the device selection process. This is used when the
 * `controlledAudioDevices` URL parameter is set, which is currently only true on mobile.
 */
export class IOSControlledAudioOutput implements MediaDevice<
  AudioOutputDeviceLabel,
  SelectedAudioOutputDevice
> {
  private logger = rootLogger.getChild("[MediaDevices ControlledAudioOutput]");
  // We need to subscribe to the raw devices so that the OS does update the input
  // back to what it was before. otherwise we will switch back to the default
  // whenever we allocate a new stream.
  public readonly availableRaw$ = availableRawDevices$(
    "audiooutput",
    this.usingNames$,
    this.scope,
    this.logger,
  );

  public readonly available$ = this.scope.behavior(
    combineLatest(
      [controlledAvailableOutputDevices$.pipe(startWith([])), iosDeviceMenu$],
      (availableRaw, iosDeviceMenu) => {
        this.logger.debug("Available device update ", availableRaw);
        const available = new Map<string, AudioOutputDeviceLabel>(
          availableRaw.map(
            ({ id, name, isEarpiece, isSpeaker /*,isExternalHeadset*/ }) => {
              let deviceLabel: AudioOutputDeviceLabel;
              // if (isExternalHeadset) // Do we want this?
              if (isEarpiece) deviceLabel = { type: "earpiece" };
              else if (isSpeaker) deviceLabel = { type: "speaker" };
              else deviceLabel = { type: "name", name };
              return [id, deviceLabel];
            },
          ),
        );

        // Create a virtual earpiece device in case a non-earpiece device is
        // designated for this purpose
        if (iosDeviceMenu && availableRaw.some((d) => d.forEarpiece)) {
          this.logger.info(
            `IOS Add virtual earpiece device with id ${EARPIECE_CONFIG_ID}`,
          );
          available.set(EARPIECE_CONFIG_ID, { type: "earpiece" });
        }

        return available;
      },
    ),
  );

  private readonly deviceSelection$ = new Subject<string>();

  public select(id: string): void {
    this.logger.info(`select device: ${id}`);
    this.deviceSelection$.next(id);
  }

  public readonly selected$ = this.scope.behavior(
    combineLatest(
      [
        this.available$,
        merge(
          controlledOutputSelection$.pipe(startWith(undefined)),
          this.deviceSelection$,
        ),
      ],
      (available, preferredId) => {
        const id = preferredId ?? available.keys().next().value;
        return id === undefined
          ? undefined
          : { id, virtualEarpiece: id === EARPIECE_CONFIG_ID };
      },
    ).pipe(
      tap((selected) => {
        this.logger.debug(`selected device: ${selected?.id}`);
      }),
    ),
  );

  public constructor(
    private readonly usingNames$: Behavior<boolean>,
    private readonly scope: ObservableScope,
  ) {
    this.selected$.subscribe((device) => {
      // Let the hosting application know which output device has been selected.
      // This information is probably only of interest if the earpiece mode has
      // been selected - for example, Element X iOS listens to this to determine
      // whether it should enable the proximity sensor.
      if (device !== undefined) {
        this.logger.info("onAudioDeviceSelect called:", device);
        window.controls.onAudioDeviceSelect?.(device.id);
        // Also invoke the deprecated callback for backward compatibility
        window.controls.onOutputDeviceSelect?.(device.id);
      }
    });
    this.available$.subscribe((available) => {
      this.logger.debug("available devices:", available);
    });
    this.availableRaw$.subscribe((availableRaw) => {
      this.logger.debug("available raw devices:", availableRaw);
    });
  }
}
