# MatrixRTC SDK (EXPERIMENTAL)

`@element-hq/matrixrtc-sdk` is the call model under Element Call, on its own:
it joins a MatrixRTC slot in a Matrix room, writes and watches the memberships,
connects to the media transport (LiveKit today), publishes the local media and
exposes every member and their tracks as observables. It has no UI. Element
Call's own `CallViewModel` is one consumer of it; any host can build a different
view on top. The design is in [`SdkArchitecture.md`](./SdkArchitecture.md), what
moved out of Element Call's `src/` in [`SdkMigration.md`](./SdkMigration.md).

**Status:** first implementation. `createRTCSlot` and `slot.join()` join the
session, connect to the transport, publish the local media and expose every
member's media; the development harness and its e2e tests in `playwright/sdk`
drive it, and Element Call's own `CallViewModel` is built on it. It depends on
nothing in Element Call's `src/`.

## Using it

```ts
import {
  createRTCSlot,
  E2eeType,
  MatrixRTCMode,
  ObservableScope,
  trackBySource$,
} from "@element-hq/matrixrtc-sdk";

const scope = new ObservableScope();
const slot = createRTCSlot(
  scope,
  client, // a matrix-js-sdk MatrixClient, logged in and syncing
  room, // the matrix-js-sdk Room, from client.getRoom() once the join has synced
  {
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    matrixRTCMode: MatrixRTCMode.Compatibility,
  },
);
const participation = slot.join({
  publish: [{ source: "microphone" }, { source: "camera" }],
});

// A <video> for each remote member's camera and an <audio> for its microphone.
// A track plays on an element once attached to it; detach before the element
// leaves the DOM. (`tileFor`, `setName` and `removeTilesExcept` are the host's.)
participation.remoteMembers$.subscribe((members) => {
  for (const member of members) {
    const { video, audio } = tileFor(member.memberId);
    member.displayName$.subscribe((name) => setName(member.memberId, name));
    trackBySource$(scope, member.tracks$, "camera").subscribe((track) =>
      track?.attach(video),
    );
    trackBySource$(scope, member.tracks$, "microphone").subscribe((track) =>
      track?.attach(audio),
    );
  }
  removeTilesExcept(members.map((m) => m.memberId));
});

// later
participation.leave();
scope.end();
```

`participation.localMember$` is one member of the same shape, null until our own
membership is in the room; its microphone would only echo.

[`dev/main.ts`](./dev/main.ts) is this example as a working page.

## Reading the code

Three files define the surface. Read them in this order.

- [`src/api.ts`](./src/api.ts): the MatrixRTC side. An `RTCSlot` is the
  namespace in a room that memberships join into; `join()` returns an
  `RTCParticipation`, which lasts until its `leave()` and exposes `state$`,
  `localMember$` and `remoteMembers$`. Members, transports and the participation
  state machine live here. `createRTCSlot` in `RTCSlot.ts` is the only way to get
  an implementation.
- [`src/media-api.ts`](./src/media-api.ts): media as a host sees it, on
  `remoteMembers$` and `localMember$`. `PublishRequest` says what to publish
  (microphone, camera, screen share); `MediaTrack` is how it arrives. The
  underlying tracks stay hidden: the host hands an element to `attach` and the
  SDK plays into it. The local variants carry the controls (`setEnabled`,
  `setDevice`, `setProcessor`).
- [`src/media-backend/api.ts`](./src/media-backend/api.ts): internal, the seam
  between the session and whatever carries the media. The session speaks
  MatrixRTC; a `MediaBackend` speaks one media protocol and hands back the
  `MemberMedia` of each member through `mediaFor()`. A host rarely touches it;
  it matters when working on the LiveKit backend under
  `src/media-backend/livekit/`, the only place that imports `livekit-client`, or
  when writing a new backend.

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
