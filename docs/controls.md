# Global JS controls

A few aspects of Element Call's interface can be controlled through a global API on the `window`.

## Picture-in-picture

- `controls.canEnterPip(): boolean` Determines whether it's possible to enter picture-in-picture mode.
- `controls.enablePip(): void` Puts the call interface into picture-in-picture mode. Throws if not in a call.
- `controls.disablePip(): void` Takes the call interface out of picture-in-picture mode, restoring it to its natural display mode. Throws if not in a call.

## Audio devices

On mobile platforms (iOS, Android), web views do not reliably support selecting audio output devices such as the main speaker, earpiece, or headset. To address this limitation, the following functions allow the hosting application (e.g., Element Web, Element X) to manage audio devices via exposed JavaScript interfaces. These functions must be enabled using the URL parameter `controlledAudioDevices` to take effect.

- `controls.setAvailableAudioDevices(devices: { id: string, name: string, forEarpiece?: boolean, isEarpiece?: boolean isSpeaker?: boolean, isExternalHeadset?, boolean; }[]): void` Sets the list of available audio outputs. `forEarpiece` is used on iOS only.
  It flags the device that should be used if the user selects earpiece mode. This should be the main stereo loudspeaker of the device.
- `controls.onAudioDeviceSelect: ((id: string) => void) | undefined` Callback called whenever the user or application selects a new audio output.
- `controls.setAudioDevice(id: string): void` Sets the selected audio device in Element Call's menu. This should be used if the OS decides to automatically switch to Bluetooth, for example.
- `controls.setAudioEnabled(enabled: boolean)` Enables/disables all audio output from the application. Output is enabled by default.
- `showNativeAudioDevicePicker: (() => void) | undefined`. Callback called whenever the user presses the output button in the settings menu.
  This button is only shown on iOS. (`userAgent.includes("iPhone")`)
