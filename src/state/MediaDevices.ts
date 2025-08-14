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
  pairwise,
  startWith,
  Subject,
  switchMap,
  type Observable,
} from "rxjs";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";

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
import { switchWhen } from "../utils/observable";
import { type Behavior, constant } from "./Behavior";

// This hardcoded id is used in EX ios! It can only be changed in coordination with
// the ios swift team.
const EARPIECE_CONFIG_ID = "earpiece-id";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number };

export type AudioOutputDeviceLabel =
  | DeviceLabel
  | { type: "speaker" }
  | { type: "earpiece" }
  | { type: "default"; name: string | null };

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
  available$: Behavior<Map<string, Label>>;
  /**
   * The selected device.
   */
  selected$: Behavior<Selected | undefined>;
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
  platform === "ios" ? constant(true) : alwaysShowIphoneEarpieceSetting.value$;

function availableRawDevices$(
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

class AudioOutput
  implements MediaDevice<AudioOutputDeviceLabel, SelectedAudioOutputDevice>
{
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
      map((id) =>
        id === undefined
          ? undefined
          : {
              id,
              virtualEarpiece: false,
            },
      ),
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

class ControlledAudioOutput
  implements MediaDevice<AudioOutputDeviceLabel, SelectedAudioOutputDevice>
{
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
        if (iosDeviceMenu && availableRaw.some((d) => d.forEarpiece))
          available.set(EARPIECE_CONFIG_ID, { type: "earpiece" });

        return available;
      },
    ),
  );

  private readonly deviceSelection$ = new Subject<string>();

  public select(id: string): void {
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
        this.logger.info(
          "[controlled-output] onAudioDeviceSelect called:",
          device,
        );
        window.controls.onAudioDeviceSelect?.(device.id);
        // Also invoke the deprecated callback for backward compatibility
        window.controls.onOutputDeviceSelect?.(device.id);
      }
    });
    this.available$.subscribe((available) => {
      this.logger.info("[controlled-output] available devices:", available);
    });
    this.availableRaw$.subscribe((availableRaw) => {
      this.logger.info(
        "[controlled-output] available raw devices:",
        availableRaw,
      );
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
    ? new ControlledAudioOutput(this.usingNames$, this.scope)
    : new AudioOutput(this.usingNames$, this.scope);

  public readonly videoInput: MediaDevice<DeviceLabel, SelectedDevice> =
    new VideoInput(this.usingNames$, this.scope);

  public constructor(private readonly scope: ObservableScope) {}
}
