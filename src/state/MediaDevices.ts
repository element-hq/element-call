/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  filter,
  map,
  type Observable,
  pairwise,
  Subject,
  switchMap,
} from "rxjs";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";

import {
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
  audioInput as audioInputSetting,
  audioOutput as audioOutputSetting,
  videoInput as videoInputSetting,
} from "../settings/settings";
import { type ObservableScope } from "./ObservableScope";
import { availableOutputDevices$ as controlledAvailableOutputDevices$ } from "../controls";
import { getUrlParams } from "../UrlParams";
import { platform } from "../Platform";
import { switchWhen } from "../utils/observable";
import { type Behavior, constant } from "./Behavior";
import { AndroidControlledAudioOutput } from "./AndroidControlledAudioOutput.ts";
import { IOSControlledAudioOutput } from "./IOSControlledAudioOutput.ts";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number };

export type AudioOutputDeviceLabel =
  | DeviceLabel
  | { type: "speaker" }
  | { type: "earpiece" }
  | { type: "default"; name: string | null };

/**
 * Base selected-device value shared by all media kinds.
 *
 * `id` is the effective device identifier used by browser media APIs.
 */
export interface SelectedDevice {
  id: string;
}

/**
 * Selected audio input value with audio-input-specific metadata.
 */
export interface SelectedAudioInputDevice extends SelectedDevice {
  /**
   * Emits whenever we think that this audio input device has logically changed
   * to refer to a different hardware device.
   */
  hardwareDeviceChange$: Observable<void>;
}

/**
 * Selected audio output value with output-routing-specific metadata.
 */
export interface SelectedAudioOutputDevice extends SelectedDevice {
  /**
   * Whether this device is a "virtual earpiece" device. If so, we should output
   * on a single channel of the device at a reduced volume.
   */
  virtualEarpiece: boolean;
}

/**
 * Common reactive contract for selectable input/output media devices (mic, speaker, camera).
 *
 * `Label` is the type used to represent a device in UI lists.
 * `Selected` is the type used to represent the active selection for a device kind.
 */
export interface MediaDevice<Label, Selected> {
  /**
   * Reactive map of currently available devices keyed by device ID.
   *
   * `Label` defines the UI-facing label data structure for each device type.
   */
  available$: Behavior<Map<string, Label>>;

  /**
   * The active device selection.
   * Can be `undefined` when no device is yet selected.
   *
   * When defined, `Selected` contains the selected device ID plus any
   * type-specific metadata.
   */
  selected$: Behavior<Selected | undefined>;

  /**
   * Requests selection of a device by ID.
   *
   * Implementations typically persist this preference and let `selected$`
   * converge to the effective device (which may differ if the requested ID is
   * unavailable).
   */
  select(id: string): void;
}

/**
 * An observable that represents if we should display the devices menu for iOS.
 *
 * This implies the following
 *  - hide any input devices (they do not work anyhow on ios)
 *  - Show a button to show the native output picker instead.
 *  - Only show the earpiece toggle option if the earpiece is available:
 *   `availableOutputDevices$.includes((d)=>d.forEarpiece)`
 */
export const iosDeviceMenu$ =
  platform === "ios" ? constant(true) : alwaysShowIphoneEarpieceSetting.value$;

export function availableRawDevices$(
  kind: MediaDeviceKind,
  usingNames$: Behavior<boolean>,
  scope: ObservableScope,
  logger: Logger,
): Behavior<MediaDeviceInfo[]> {
  const logError = (e: Error): void =>
    logger.error("Error creating MediaDeviceObserver", e);
  const devices$ = createMediaDeviceObserver(kind, logError, false);
  const devicesWithNames$ = createMediaDeviceObserver(kind, logError, true);

  return scope.behavior(
    usingNames$.pipe(
      switchMap((withNames) =>
        withNames
          ? // It might be that there is already a media stream running somewhere,
            // and so we can do without requesting a second one. Only switch to the
            // device observer that explicitly requests the names if we see that
            // names are in fact missing from the initial device enumeration.
            devices$.pipe(
              switchWhen(
                (devices, i) => i === 0 && devices.every((d) => !d.label),
                devicesWithNames$,
              ),
            )
          : devices$,
      ),
    ),
    [],
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
      if (preferredId !== undefined && available.has(preferredId)) {
        // If the preferred device is available, use it.
        return preferredId;
      } else if (available.size === 1 && available.has("")) {
        // In some cases the enumerateDevices will list the devices with empty string details:
        // `{deviceId:'', kind:'audiooutput|audioinput|videoinput', label:'', groupId:''}`
        // This can happen when:
        //     1. The user has not yet granted permissions to microphone/devices
        //     2. The page is not running in a secure context (e.g. localhost or https)
        //     3. In embedded WebViews, restrictions are often tighter, need active capture..
        //     3. The browser is blocking access to device details for privacy reasons (?)
        // This is most likely transitional, so keep the current device selected until we get a more accurate enumerateDevices.
        return preferredId;
      } else {
        // No preferred, so pick a default.
        return available.keys().next().value;
      }
    }
    return undefined;
  });
}

class AudioInput implements MediaDevice<DeviceLabel, SelectedAudioInputDevice> {
  private logger = rootLogger.getChild("[MediaDevices AudioInput]");

  private readonly availableRaw$: Behavior<MediaDeviceInfo[]> =
    availableRawDevices$(
      "audioinput",
      this.usingNames$,
      this.scope,
      this.logger,
    );

  public readonly available$ = this.scope.behavior(
    this.availableRaw$.pipe(map(buildDeviceMap)),
  );

  public readonly selected$ = this.scope.behavior(
    selectDevice$(this.available$, audioInputSetting.value$).pipe(
      map((id) =>
        id === undefined
          ? undefined
          : {
              id,
              // We can identify when the hardware device has changed by watching for
              // changes in the group ID
              hardwareDeviceChange$: this.availableRaw$.pipe(
                map(
                  (devices) => devices.find((d) => d.deviceId === id)?.groupId,
                ),
                pairwise(),
                filter(([before, after]) => before !== after),
                map(() => undefined),
              ),
            },
      ),
    ),
  );

  public select(id: string): void {
    audioInputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Behavior<boolean>,
    private readonly scope: ObservableScope,
  ) {
    this.available$.subscribe((available) => {
      this.logger.info("[audio-input] available devices:", available);
    });
  }
}

export class AudioOutput implements MediaDevice<
  AudioOutputDeviceLabel,
  SelectedAudioOutputDevice
> {
  private logger = rootLogger.getChild("[MediaDevices AudioOutput]");
  public readonly available$ = this.scope.behavior(
    availableRawDevices$(
      "audiooutput",
      this.usingNames$,
      this.scope,
      this.logger,
    ).pipe(
      map((availableRaw) => {
        let available: Map<string, AudioOutputDeviceLabel> =
          buildDeviceMap(availableRaw);
        // Create a virtual default audio output for browsers that don't have one.
        // Its device ID must be the empty string because that's what setSinkId
        // recognizes.
        if (available.size && !available.has("") && !available.has("default"))
          available.set("", {
            type: "default",
            name: availableRaw[0]?.label || null,
          });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isSafari = !!(window as any).GestureEvent; // non standard api only found on Safari. https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent#browser_compatibility
        if (isSafari) {
          // set to empty map if we are on Safari, because it does not support setSinkId
          available = new Map();
        }
        // Note: creating virtual default input devices would be another problem
        // entirely, because requesting a media stream from deviceId "" won't
        // automatically track the default device.
        return available;
      }),
    ),
  );

  public readonly selected$ = this.scope.behavior(
    selectDevice$(this.available$, audioOutputSetting.value$).pipe(
      map((id) => {
        if (id === undefined) {
          return undefined;
        } else {
          return {
            id,
            virtualEarpiece: false,
          };
        }
      }),
    ),
  );
  public select(id: string): void {
    audioOutputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Behavior<boolean>,
    private readonly scope: ObservableScope,
  ) {
    this.available$.subscribe((available) => {
      this.logger.info("[audio-output] available devices:", available);
    });
  }
}

class VideoInput implements MediaDevice<DeviceLabel, SelectedDevice> {
  private logger = rootLogger.getChild("[MediaDevices VideoInput]");

  public readonly available$ = this.scope.behavior(
    availableRawDevices$(
      "videoinput",
      this.usingNames$,
      this.scope,
      this.logger,
    ).pipe(map(buildDeviceMap)),
  );
  public readonly selected$ = this.scope.behavior(
    selectDevice$(this.available$, videoInputSetting.value$).pipe(
      map((id) => (id === undefined ? undefined : { id })),
    ),
  );
  public select(id: string): void {
    videoInputSetting.setValue(id);
  }

  public constructor(
    private readonly usingNames$: Behavior<boolean>,
    private readonly scope: ObservableScope,
  ) {
    // This also has the purpose of subscribing to the available devices
    this.available$.subscribe((available) => {
      this.logger.info("[video-input] available devices:", available);
    });
  }
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
  private readonly usingNames$ = this.scope.behavior(
    this.deviceNamesRequest$.pipe(map(() => true)),
    false,
  );
  public readonly audioInput: MediaDevice<
    DeviceLabel,
    SelectedAudioInputDevice
  > = new AudioInput(this.usingNames$, this.scope);

  public readonly audioOutput: MediaDevice<
    AudioOutputDeviceLabel,
    SelectedAudioOutputDevice
  > = getUrlParams().controlledAudioDevices
    ? platform == "android"
      ? new AndroidControlledAudioOutput(
          controlledAvailableOutputDevices$,
          this.scope,
          getUrlParams().callIntent,
          window.controls,
        )
      : new IOSControlledAudioOutput(
          this.usingNames$,
          this.scope,
          getUrlParams().callIntent,
        )
    : new AudioOutput(this.usingNames$, this.scope);

  public readonly videoInput: MediaDevice<DeviceLabel, SelectedDevice> =
    new VideoInput(this.usingNames$, this.scope);

  public constructor(private readonly scope: ObservableScope) {}
}
