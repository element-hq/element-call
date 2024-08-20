# Global JS controls

A few aspects of Element Call's interface can be controlled through a global API on the `window`:

- `controls.enablePip(): void` Puts the call interface into picture-in-picture mode. Throws if not in a call.
- `controls.disablePip(): void` Takes the call interface out of picture-in-picture mode, restoring it to its natural display mode. Throws if not in a call.
