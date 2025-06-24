/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  filter,
  map,
  merge,
  of,
  pairwise,
  startWith,
  Subject,
  switchMap,
  type Observable,
} from "rxjs";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  audioInput as audioInputSetting,
  audioOutput as audioOutputSetting,
  videoInput as videoInputSetting,
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
} from "../settings/settings";
import { type ObservableScope } from "./ObservableScope";
import {
  outputDevice$ as controlledOutputSelection$,
  availableOutputDevices$ as controlledAvailableOutputDevices$,
} from "../controls";
import { getUrlParams } from "../UrlParams";
import { platform } from "../Platform";

// This hardcoded id is used in EX ios! It can only be changed in coordination with
// the ios swift team.
const EARPIECE_CONFIG_ID = "earpiece-id";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number }
  | { type: "default"; name: string | null };

export type AudioOutputDeviceLabel = DeviceLabel | { type: "earpiece" };

export interface SelectedDevice {
  id: string;
}

export interface SelectedAudioInputDevice extends SelectedDevice {
  /**
   * Emits whenever we think that this audio input device has logically changed
   * to refer to a different hardware device.
   */
  hardwareDeviceChange$: Observable<void>;
}

export interface SelectedAudioOutputDevice extends SelectedDevice {
  /**
   * Whether this device is a "virtual earpiece" device. If so, we should output
   * on a single channel of the device at a reduced volume.
   */
  virtualEarpiece: boolean;
}

export interface MediaDevice<Label, Selected> {
  /**
   * A map from available device IDs to labels.
   */
  available$: Observable<Map<string, Label>>;
  /**
   * The selected device.
   */
  selected$: Observable<Selected | undefined>;
  /**
   * Selects a new device.
   */
  select(id: string): void;
}

/**
 * An observable that represents if we should display the devices menu for iOS.
 * This implies the following
 *  - hide any input devices (they do not work anyhow on ios)
 *  - Show a button to show the native output picker instead.
 *  - Only show the earpiece toggle option if the earpiece is available:
 *   `availableOutputDevices$.includes((d)=>d.forEarpiece)`
 */
export const iosDeviceMenu$ =
  platform === "ios" ? of(true) : alwaysShowIphoneEarpieceSetting.value$;

function availableRawDevices$(
  kind: MediaDeviceKind,
  usingNames$: Observable<boolean>,
  scope: ObservableScope,
): Observable<MediaDeviceInfo[]> {
  return usingNames$.pipe(
    switchMap((usingNames) =>
      createMediaDeviceObserver(
        kind,
        (e) => logger.error("Error creating MediaDeviceObserver", e),
        usingNames,
      ),
    ),
    startWith([]),
    scope.state(),
  );
}

function buildDeviceMap(
  availableRaw: MediaDeviceInfo[],
): Map<string, DeviceLabel> {
  return new Map<string, DeviceLabel>(
    availableRaw.map((d, i) => [
      d.deviceId,
      d.label
        ? { type: "name", name: d.label }
        : { type: "number", number: i + 1 },
    ]),
  );
}

function selectDevice$<Label>(
  available$: Observable<Map<string, Label>>,
  preferredId$: Observable<string | undefined>,
): Observable<string | undefined> {
  return combineLatest([available$, preferredId$], (available, preferredId) => {
    if (available.size) {
      // If the preferred device is available, use it. Or if every available
      // device ID is falsy, the browser is probably just being paranoid about
      // fingerprinting and we should still try using the preferred device.
      // Worst case it is not available and the browser will gracefully fall
      // back to some other device for us when requesting the media stream.
      // Otherwise, select the first available device.
      return (preferredId !== undefined && available.has(preferredId)) ||
        (available.size === 1 && available.has(""))
        ? preferredId
        : available.keys().next().value;
    }
    return undefined;
  });
}

class AudioInput implements MediaDevice<DeviceLabel, SelectedAudioInputDevice> {
  private readonly availableRaw$: Observable<MediaDeviceInfo[]> =
    availableRawDevices$("audioinput", this.usingNames$, this.scope);

  public readonly available$ = this.availableRaw$.pipe(
    map(buildDeviceMap),
    this.scope.state(),
  );

  public readonly selected$ = selectDevice$(
    this.available$,
    audioInputSetting.value$,
  ).pipe(
    map((id) =>
      id === undefined
        ? undefined
        : {
            id,
            // We can identify when the hardware device has changed by watching for
            // changes in the group ID
            hardwareDeviceChange$: this.availableRaw$.pipe(
              map((devices) => devices.find((d) => d.deviceId === id)?.groupId),
              pairwise(),
              filter(([before, after]) => before !== after),
              map(() => undefined),
            ),
          },
    ),
    this.scope.state(),
  );

  public select(id: string): void {
    audioInputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Observable<boolean>,
    private readonly scope: ObservableScope,
  ) {}
}

class AudioOutput
  implements MediaDevice<AudioOutputDeviceLabel, SelectedAudioOutputDevice>
{
  public readonly available$ = availableRawDevices$(
    "audiooutput",
    this.usingNames$,
    this.scope,
  ).pipe(
    map((availableRaw) => {
      const available = buildDeviceMap(availableRaw);
      // Create a virtual default audio output for browsers that don't have one.
      // Its device ID must be the empty string because that's what setSinkId
      // recognizes.
      if (available.size && !available.has("") && !available.has("default"))
        available.set("", {
          type: "default",
          name: availableRaw[0]?.label || null,
        });
      // Note: creating virtual default input devices would be another problem
      // entirely, because requesting a media stream from deviceId "" won't
      // automatically track the default device.
      return available;
    }),
    this.scope.state(),
  );

  public readonly selected$ = selectDevice$(
    this.available$,
    audioOutputSetting.value$,
  ).pipe(
    map((id) =>
      id === undefined
        ? undefined
        : {
            id,
            virtualEarpiece: false,
          },
    ),
    this.scope.state(),
  );

  public select(id: string): void {
    audioOutputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Observable<boolean>,
    private readonly scope: ObservableScope,
  ) {}
}

class ControlledAudioOutput
  implements MediaDevice<AudioOutputDeviceLabel, SelectedAudioOutputDevice>
{
  public readonly available$ = combineLatest(
    [controlledAvailableOutputDevices$.pipe(startWith([])), iosDeviceMenu$],
    (availableRaw, iosDeviceMenu) => {
      const available = new Map<string, AudioOutputDeviceLabel>(
        availableRaw.map(
          ({ id, name, isEarpiece, isSpeaker /*,isExternalHeadset*/ }) => {
            let deviceLabel: AudioOutputDeviceLabel;
            // if (isExternalHeadset) // Do we want this?
            if (isEarpiece) deviceLabel = { type: "earpiece" };
            else if (isSpeaker) deviceLabel = { type: "default", name };
            else deviceLabel = { type: "name", name };
            return [id, deviceLabel];
          },
        ),
      );

      // Create a virtual earpiece device in case a non-earpiece device is
      // designated for this purpose
      if (iosDeviceMenu && availableRaw.some((d) => d.forEarpiece))
        available.set(EARPIECE_CONFIG_ID, { type: "earpiece" });

      return available;
    },
  ).pipe(this.scope.state());

  private readonly deviceSelection$ = new Subject<string>();

  public select(id: string): void {
    this.deviceSelection$.next(id);
  }

  public readonly selected$ = merge(
    this.deviceSelection$,
    controlledOutputSelection$,
  ).pipe(
    startWith<string | undefined>(undefined),
    map((id) =>
      id === undefined
        ? undefined
        : { id, virtualEarpiece: id === EARPIECE_CONFIG_ID },
    ),
    this.scope.state(),
  );

  public constructor(private readonly scope: ObservableScope) {
    this.selected$.subscribe((device) => {
      // Let the hosting application know which output device has been selected.
      // This information is probably only of interest if the earpiece mode has
      // been selected - for example, Element X iOS listens to this to determine
      // whether it should enable the proximity sensor.
      if (device !== undefined) {
        logger.info("[controlled-output] setAudioDeviceSelect called:", device);
        window.controls.onAudioDeviceSelect?.(device.id);
        // Also invoke the deprecated callback for backward compatibility
        window.controls.onOutputDeviceSelect?.(device.id);
      }
    });
  }
}

class VideoInput implements MediaDevice<DeviceLabel, SelectedDevice> {
  public readonly available$ = availableRawDevices$(
    "videoinput",
    this.usingNames$,
    this.scope,
  ).pipe(map(buildDeviceMap));

  public readonly selected$ = selectDevice$(
    this.available$,
    videoInputSetting.value$,
  ).pipe(
    map((id) => (id === undefined ? undefined : { id })),
    this.scope.state(),
  );

  public select(id: string): void {
    videoInputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Observable<boolean>,
    private readonly scope: ObservableScope,
  ) {}
}

export class MediaDevices {
  private readonly deviceNamesRequest$ = new Subject<void>();
  /**
   * Requests that the media devices be populated with the names of each
   * available device, rather than numbered identifiers. This may invoke a
   * permissions pop-up, so it should only be called when there is a clear user
   * intent to view the device list.
   */
  public requestDeviceNames(): void {
    this.deviceNamesRequest$.next();
  }

  // Start using device names as soon as requested. This will cause LiveKit to
  // briefly request device permissions and acquire media streams for each
  // device type while calling `enumerateDevices`, which is what browsers want
  // you to do to receive device names in lieu of a more explicit permissions
  // API. This flag never resets to false, because once permissions are granted
  // the first time, the user won't be prompted again until reload of the page.
  private readonly usingNames$ = this.deviceNamesRequest$.pipe(
    map(() => true),
    startWith(false),
    this.scope.state(),
  );

  public readonly audioInput: MediaDevice<
    DeviceLabel,
    SelectedAudioInputDevice
  > = new AudioInput(this.usingNames$, this.scope);

  public readonly audioOutput: MediaDevice<
    AudioOutputDeviceLabel,
    SelectedAudioOutputDevice
  > = getUrlParams().controlledAudioDevices
    ? new ControlledAudioOutput(this.scope)
    : new AudioOutput(this.usingNames$, this.scope);

  public readonly videoInput: MediaDevice<DeviceLabel, SelectedDevice> =
    new VideoInput(this.usingNames$, this.scope);

  public constructor(private readonly scope: ObservableScope) {}
}
