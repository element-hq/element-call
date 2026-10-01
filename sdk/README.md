# MatrixRTC SDK (EXPERIMENTAL)

`@element-hq/matrixrtc-sdk` is the call model under Element Call, on its own:
MatrixRTC memberships and transports, LiveKit connections, publishing, E2EE keys and
the media of every member, as observables. It has no UI. Element Call's own
`CallViewModel` is meant to become one consumer of it; the design is in
[`sdk-plan.md`](../sdk-plan.md).

**Status:** interface only. `createRtcSession` returns an object that does nothing.
The development harness and its e2e test exist so the implementation can be built
against them.

## Using it

```ts
import {
  constant,
  createRtcSession,
  E2eeType,
  MatrixRTCMode,
  ObservableScope,
} from "@element-hq/matrixrtc-sdk";

const scope = new ObservableScope();
const session = createRtcSession(
  scope,
  client, // a matrix-js-sdk MatrixClient, logged in and syncing
  room, // the matrix-js-sdk Room to hold the session in
  {
    microphoneEnabled$: constant(true),
    cameraEnabled$: constant(true),
    audioInputDeviceId$: constant(undefined),
    videoInputDeviceId$: constant(undefined),
    videoProcessor$: constant(undefined),
  },
  {
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    matrixRTCMode: MatrixRTCMode.Compatibility,
  },
);
session.join();

session.remoteMembers$.subscribe((members) => {
  // each member has displayName$, media$ and more; a media track is rendered
  // by handing it a <video> or <audio> element: track.attach(element)
});

// later
session.leave();
scope.end();
```

[`dev/main.ts`](./dev/main.ts) is this example as a working page.

## Development

Everything runs from the repository root. This directory is a pnpm project of its
own only so that a host can install it as a git dependency (see
`pnpm-workspace.yaml`).

```sh
pnpm dev:sdk              # the harness, https://localhost:3002
pnpm build:sdk            # dist/matrixrtc-sdk.js and dist/types
pnpm test:playwright playwright/sdk   # needs `pnpm backend`
```

## Installing

```sh
pnpm add github:element-hq/element-call#<ref>&path:/sdk
```

The host supplies `matrix-js-sdk`, `livekit-client` and `rxjs`; the build leaves
them external.
