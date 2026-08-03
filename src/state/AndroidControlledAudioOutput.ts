/*
Copyright 2026 Element Corp.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  distinctUntilChanged,
  map,
  merge,
  type Observable,
  scan,
  startWith,
  Subject,
  tap,
} from "rxjs";

import {
  type AudioOutputDeviceLabel,
  type MediaDevice,
  type SelectedAudioOutputDevice,
} from "./MediaDevices.ts";
import type { ObservableScope } from "./ObservableScope.ts";
import type { RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";
import { type Controls, type OutputDevice } from "../controls.ts";
import { type Behavior } from "./Behavior.ts";

type ControllerState = {
  /**
   * The list of available output devices, ordered by preference order (most preferred first).
   */
  devices: OutputDevice[];
  /**
   * Explicit user preference for the selected device.
   */
  preferredDeviceId: string | undefined;
  /**
   * The effective selected device, always valid against available devices.
   */
  selectedDeviceId: string | undefined;
};

/**
 * The possible actions that can be performed on the controller,
 * either by the user or by the system.
 */
type ControllerAction =
  | { type: "selectDevice"; deviceId: string | undefined }
  | { type: "deviceUpdated"; devices: OutputDevice[] };
/**
 * The implementation of the audio output media device for Android when using the controlled audio output mode.
 *
 * In this mode, the hosting application (e.g. Element Mobile) is responsible for providing the list of available audio output devices.
 * There are some android specific logic compared to others:
 *  - AndroidControlledAudioOutput is the only one responsible for selecting the best output device.
 *  - On android, we don't listen to the selected device from native code (control.setAudioDevice).
 *  - If a new device is added or removed, this controller will determine the new selected device based
 *    on the available devices (that is ordered by preference order) and the user's selection (if any).
 *
 * Given the differences in how the native code is handling the audio routing on Android compared to iOS,
 * we have this separate implementation. It allows us to have proper testing and avoid side effects
 * from platform specific logic breaking the other platform's implementation.
 */
export class AndroidControlledAudioOutput implements MediaDevice<
  AudioOutputDeviceLabel,
  SelectedAudioOutputDevice
> {
  private logger = rootLogger.getChild(
    "[MediaDevices AndroidControlledAudioOutput]",
  );

  /**
   * STATE stream: the current state of the controller, including the list of available devices and the selected device.
   */
  private readonly controllerState$: Behavior<ControllerState>;

  /**
   * @inheritdoc
   */
  public readonly available$: Behavior<Map<string, AudioOutputDeviceLabel>>;

  /**
   * Effective selected device, always valid against available devices.
   *
   * On android, we don't listen to the selected device from native code (control.setAudioDevice).
   * Instead, we determine the selected device ourselves based on the available devices and the user's selection (if any).
   */
  public readonly selected$: Behavior<SelectedAudioOutputDevice | undefined>;

  // COMMAND stream: user asks to select a device
  private readonly selectDeviceCommand$ = new Subject<string | undefined>();

  public select(id: string): void {
    this.logger.info(`select device: ${id}`);
    this.selectDeviceCommand$.next(id);
  }

  /**
   * Creates an instance of AndroidControlledAudioOutput.
   *
   * @constructor
   * @param controlledDevices$ - The list of available output devices coming from the hosting application, ordered by preference order (most preferred first).
   * @param scope - The ObservableScope to create the Behaviors in.
   * @param initialIntent - The initial call intent (e.g. "audio" or "video") that can be used to determine the default audio routing (e.g. default to earpiece for audio calls and speaker for video calls).
   * @param controls - The controls provided by the hosting application to control the audio routing and notify of user actions.
   */
  public constructor(
    private readonly controlledDevices$: Observable<OutputDevice[]>,
    private readonly scope: ObservableScope,
    private initialIntent: RTCCallIntent | undefined = undefined,
    controls: Controls,
  ) {
    this.controllerState$ = this.startObservingState$();

    this.selected$ = this.effectiveSelectionFromState$(this.controllerState$);

    this.available$ = scope.behavior(
      this.controllerState$.pipe(
        map((state) => {
          this.logger.info("available devices updated:", state.devices);

          return new Map<string, AudioOutputDeviceLabel>(
            state.devices.map((outputDevice) => {
              return [outputDevice.id, mapDeviceToLabel(outputDevice)];
            }),
          );
        }),
      ),
    );

    // Effect 1: notify host when effective selection changes
    this.selected$
      // It is a behavior so it has built-in distinct until change
      .pipe(scope.bind())
      .subscribe((device) => {
        // Let the hosting application know which output device has been selected.
        if (device !== undefined) {
          this.logger.info("onAudioDeviceSelect called:", device);
          controls.onAudioDeviceSelect?.(device.id);
          // Also invoke the deprecated callback for backward compatibility
          // TODO: it appears that on Android the hosting application is only using the deprecated callback (onOutputDeviceSelect)
          // and not the new one (onAudioDeviceSelect), we should clean this up and only have one callback for audio device selection.
          controls.onOutputDeviceSelect?.(device.id);
        }
      });
  }

  private startObservingState$(): Behavior<ControllerState> {
    const initialState: ControllerState = {
      devices: [],
      preferredDeviceId: undefined,
      selectedDeviceId: undefined,
    };

    // Merge the two possible inputs observable as a single
    // stream of actions that will update the state of the controller.
    const actions$: Observable<ControllerAction> = merge(
      this.controlledDevices$.pipe(
        map(
          (devices) =>
            ({ type: "deviceUpdated", devices }) satisfies ControllerAction,
        ),
      ),
      this.selectDeviceCommand$.pipe(
        map(
          (deviceId) =>
            ({ type: "selectDevice", deviceId }) satisfies ControllerAction,
        ),
      ),
    );

    const initialAction: ControllerAction = {
      type: "deviceUpdated",
      devices: [],
    };

    return this.scope.behavior(
      actions$.pipe(
        startWith(initialAction),
        scan((state, action): ControllerState => {
          switch (action.type) {
            case "deviceUpdated": {
              const chosenDevice = this.chooseEffectiveSelection({
                previousDevices: state.devices,
                availableDevices: action.devices,
                currentSelectedId: state.selectedDeviceId,
                preferredDeviceId: state.preferredDeviceId,
              });

              return {
                ...state,
                devices: action.devices,
                selectedDeviceId: chosenDevice,
              };
            }
            case "selectDevice": {
              const chosenDevice = this.chooseEffectiveSelection({
                previousDevices: state.devices,
                availableDevices: state.devices,
                currentSelectedId: state.selectedDeviceId,
                preferredDeviceId: action.deviceId,
              });

              return {
                ...state,
                preferredDeviceId: action.deviceId,
                selectedDeviceId: chosenDevice,
              };
            }
          }
        }, initialState),
      ),
    );
  }

  private effectiveSelectionFromState$(
    state$: Observable<ControllerState>,
  ): Behavior<SelectedAudioOutputDevice | undefined> {
    return this.scope.behavior(
      state$
        .pipe(
          map((state) => {
            if (state.selectedDeviceId) {
              return {
                id: state.selectedDeviceId,
                /** This is an iOS thing, always false for android*/
                virtualEarpiece: false,
              };
            }
            return undefined;
          }),
          distinctUntilChanged((a, b) => a?.id === b?.id),
        )
        .pipe(
          tap((selected) => {
            this.logger.debug(`selected device: ${selected?.id}`);
          }),
        ),
    );
  }

  private chooseEffectiveSelection(args: {
    previousDevices: OutputDevice[];
    availableDevices: OutputDevice[];
    currentSelectedId: string | undefined;
    preferredDeviceId: string | undefined;
  }): string | undefined {
    const {
      previousDevices,
      availableDevices,
      currentSelectedId,
      preferredDeviceId,
    } = args;

    this.logger.debug(`chooseEffectiveSelection with args:`, args);

    // Take preferredDeviceId in priority or default to the last effective selection.
    const activeSelectedDeviceId = preferredDeviceId || currentSelectedId;
    const isAvailable = availableDevices.some(
      (device) => device.id === activeSelectedDeviceId,
    );

    // If there is no current device, or it is not available anymore,
    // choose the default device selection logic.
    if (activeSelectedDeviceId === undefined || !isAvailable) {
      this.logger.debug(
        `No current device or it is not available, using default selection logic.`,
      );
      // use the default selection logic
      return this.chooseDefaultDeviceId(availableDevices);
    }

    // Is there a new added device?
    // If a device is added, we might want to switch to it if it's more preferred than the currently selected device.
    const newDeviceWasAdded = availableDevices.some(
      (device) => !previousDevices.some((d) => d.id === device.id),
    );

    if (newDeviceWasAdded) {
      // TODO only want to check from the added device, not all devices.?
      // check if the currently selected device is the most preferred one, if not switch to the most preferred one.
      const mostPreferredDevice = availableDevices[0];
      this.logger.debug(
        `A new device was added, checking if we should switch to it.`,
        mostPreferredDevice,
      );
      if (mostPreferredDevice.id !== activeSelectedDeviceId) {
        // Given this is automatic switching, we want to be careful and only switch to a more private device
        // (e.g. from speaker to a BT headset) but not switch from a more private device to a less private one
        // (e.g. from a BT headset to the speaker), as that can be disruptive for the user if it happens unexpectedly.
        if (mostPreferredDevice.isExternalHeadset == true) {
          this.logger.info(
            `The currently selected device ${mostPreferredDevice.id} is not the most preferred one, switching to the most preferred one ${activeSelectedDeviceId} instead.`,
          );
          // Let's switch as it is a more private device.
          return mostPreferredDevice.id;
        }
      }
    }

    // no changes
    return activeSelectedDeviceId;
  }

  /**
   *   The logic for the default is different based on the call type.
   *   For example for a voice call we want to default to the earpiece if it's available,
   *   but for a video call we want to default to the speaker.
   *   If the user is using a BT headset we want to default to that, as it's likely what they want to use for both video and voice calls.
   *
   *   @param available the available audio output devices to choose from, keyed by their id, sorted by likelihood of it being used for communication.
   *
   */
  private chooseDefaultDeviceId(available: OutputDevice[]): string | undefined {
    this.logger.debug(
      `Android routing logic intent: ${this.initialIntent} finding best default...`,
    );
    if (this.initialIntent === "audio") {
      const systemProposed = available[0];
      // If no headset is connected, android will route to the speaker by default,
      // but for a voice call we want to route to the earpiece instead,
      // so override the system proposed routing in that case.
      if (systemProposed?.isSpeaker == true) {
        // search for the earpiece
        const earpieceDevice = available.find(
          (device) => device.isEarpiece == true,
        );
        if (earpieceDevice) {
          this.logger.debug(
            `Android routing: Switch to earpiece instead of speaker for voice call`,
          );
          return earpieceDevice.id;
        } else {
          this.logger.debug(
            `Android routing: no earpiece found, cannot switch, use system proposed routing`,
          );
          return systemProposed.id;
        }
      } else {
        this.logger.debug(
          `Android routing: Use system proposed routing `,
          systemProposed,
        );
        return systemProposed?.id;
      }
    } else {
      // Use the system best proposed best routing.
      return available[0]?.id;
    }
  }
}

// Utilities
function mapDeviceToLabel(device: OutputDevice): AudioOutputDeviceLabel {
  const { name, isEarpiece, isSpeaker } = device;
  if (isEarpiece) return { type: "earpiece" };
  else if (isSpeaker) return { type: "speaker" };
  else return { type: "name", name };
}
