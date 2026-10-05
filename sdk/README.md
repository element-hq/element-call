# MatrixRTC SDK (EXPERIMENTAL)

`@element-hq/matrixrtc-sdk` is the call model under Element Call, on its own:
MatrixRTC memberships and transports, media connections, publishing, E2EE keys and
the media of every member, as observables. It has no UI. Element Call's own
`CallViewModel` is meant to become one consumer of it. The design is in
[`SdkArchitecture.md`](./SdkArchitecture.md), the migration from the view model
in [`SdkMigration.md`](./SdkMigration.md). Media goes through one media backend
behind `MediaBackend`; LiveKit, under `src/media-backend/livekit/`, is the only one
today and the only place that imports `livekit-client`.

**Status:** first implementation. `createMatrixRTCClient` joins the session, connects to
the transport, publishes the local media and exposes every member's media; the
development harness and its e2e tests in `playwright/sdk` drive it, and Element
Call's own `CallViewModel` is built on it. It depends on nothing in Element Call's
`src/`.

## Using it

```ts
import {
  constant,
  createMatrixRTCClient,
  E2eeType,
  MatrixRTCMode,
  ObservableScope,
} from "@element-hq/matrixrtc-sdk";

const scope = new ObservableScope();
const rtcClient = createMatrixRTCClient(
  scope,
  client, // a matrix-js-sdk MatrixClient, logged in and syncing
  room, // the matrix-js-sdk Room, from client.getRoom() once the join has synced
  {
    publish: [{ source: "microphone" }, { source: "camera" }],
    audioOutputDeviceId$: constant(undefined),
  },
  {
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    matrixRTCMode: MatrixRTCMode.Compatibility,
  },
);
rtcClient.join();

rtcClient.remoteMembers$.subscribe((members) => {
  // each member has displayName$, media$ and more; a media track is rendered
  // by handing it a <video> or <audio> element: track.attach(element)
});

// later
rtcClient.leave();
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
