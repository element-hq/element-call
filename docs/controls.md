# Global JS controls

A few aspects of Element Call's interface can be controlled through a global API on the `window`.

## Picture-in-picture

- `controls.canEnterPip(): boolean` Determines whether it's possible to enter picture-in-picture mode.
- `controls.enablePip(): void` Puts the call interface into picture-in-picture mode. Throws if not in a call.
- `controls.disablePip(): void` Takes the call interface out of picture-in-picture mode, restoring it to its natural display mode. Throws if not in a call.

## Audio output devices

These functions must be used in conjunction with the `controlledOutput` URL parameter in order to have any effect.

- `controls.setOutputDevices(devices: { id: string, name: string }[]): void` Sets the list of available audio outputs.
- `controls.onOutputDeviceSelect: ((id: string) => void) | undefined` Callback called whenever the user or application selects a new audio output.
- `controls.setOutputEnabled(enabled: boolean)` Enables/disables all audio output from the application. This can be useful for temporarily pausing audio while the controlling application is switching output devices. Output is enabled by default.
