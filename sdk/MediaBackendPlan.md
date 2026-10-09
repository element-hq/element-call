# Media backend: trapping LiveKit behind one seam

> **Status: implemented, 4 October 2026.** All six steps landed in one change;
> the interface is in `sdk/src/backend/api.ts`, the LiveKit backend in
> `sdk/src/backend/livekit/`, and the architecture document has the section
> "Media backend". The text below is the plan as it was written, kept for the
> reasoning behind the shape.

The SDK's public API in `sdk/src/api.ts` names LiveKit in three places: the video
processor type in `PublishRequest` and `LocalVideoMediaTrack.setProcessor`, the
video codec in `VideoCaptureSettings`, and the LiveKit-flavoured client options
(`mediaQuality`, `transportUrl`, `fallbackTransportUrl`). The implementation is a
different story. LiveKit participants, rooms, connections,
tokens and data packets run through most of `sdk/src/session/`. Only the two
adapters in `sdk/src/media/` are the clean boundary they were meant to be.

MatrixRTC will get media backends other than a LiveKit SFU, full mesh and a
cascading SFU among them. Neither fits the model the session is written against
today, one connection per transport URL with a subscribe-only connection to every
remote SFU. That model is the LiveKit multi-SFU strategy, so the seam has to sit
above it. Cascading keeps the membership transport exactly as it is and only
changes which SFUs the client connects to, which makes the connection manager a
LiveKit-internal policy. Full mesh has one peer connection per remote member and
no token service at all.

This plan introduces one interface, `MediaBackend`, created once per session. It
takes the memberships and the local media inputs and hands back the media the
session consumes, plus the three things the MatrixRTC join needs from the media
side: the transport to advertise, whether the backend can take over the delayed
leave, and the handover of the delayed leave once its id is known. Everything
LiveKit moves into `sdk/src/backend/livekit/` behind it. The public API does not
change, behaviour does not change, and the `playwright/sdk` specs verify every step.

This is slice 12 in the status table of [`SdkMigration.md`](./SdkMigration.md). It
is independent of slices 6 to 11 there, and slice 7 (a neutral processor type) and
slice 11 (the error renames) get easier once the folder exists.

## What is LiveKit today

Everything under `sdk/src/session/` that imports `livekit-client`,
`@livekit/components-core`, or speaks the LiveKit token protocol:

| Module                                                                  | What it is                                                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media/LivekitMediaTrack.ts`, `media/LivekitMemberMedia.ts`             | Participant to `MemberMedia`. Clean already.                                                                                                                          |
| `session/Connection.ts`, `ConnectionFactory.ts`, `ConnectionManager.ts` | One LiveKit room per transport URL, the multi-SFU policy, the token fetch per connection.                                                                             |
| `session/MatrixLivekitMembers.ts`                                       | Matches a participant identity to a membership, epoch-paired.                                                                                                         |
| `session/Publisher.ts`, `publishOptions.ts`                             | Publish requests onto the local participant, upstream pausing, audio output switching, the capture and publish option builders.                                       |
| `session/KeyProvider.ts`, `MatrixKeyProvider.ts`                        | LiveKit's key provider on the js-sdk key stream.                                                                                                                      |
| `session/DataChannel.ts`                                                | LiveKit data packets.                                                                                                                                                 |
| `session/openIDSFU.ts`, `livekitOptions.ts`                             | The JWT service protocol, including delegation, and room options.                                                                                                     |
| `session/LocalTransport.ts`                                             | The pre-join token fetch. Discovery itself is a homeserver endpoint and stays; see "Discovery stays in the session".                                                  |
| `session/RtcTransportAutoDiscovery.ts`                                  | Generic apart from its `isLivekitTransport` filter and the fallback URL. Stays.                                                                                       |
| `session/LocalMember.ts`                                                | `participant$`, `connection$`, upstream pausing, the delegation probe and handover, and `publish` resolving with a `LocalTrackPublication`. Roughly 120 of 490 lines. |
| `session/Members.ts`                                                    | `mediaFor` takes a participant and a room; `publish` maps a `trackSid` back to a track.                                                                               |
| `session/Transports.ts`                                                 | Transport id, the connected check and `resolved$` assume LiveKit.                                                                                                     |
| `session/SessionBehaviors.ts`                                           | `membershipsAndTransports$` filters to LiveKit transports. Deleted in step 3, not moved.                                                                              |
| `session/MatrixRTCClient.ts`                                            | Wires all of the above.                                                                                                                                               |
| `utils/test.ts`                                                         | `mockRemoteParticipant`, `exampleTransport`.                                                                                                                          |

`errors.ts` has a type-only import for `LivekitConnectionError`; that is slice 11's
business and stays. `index.ts` exports `getSFUConfigWithOpenID` as
`authenticateWithTransport` for the developer panel; it keeps being exported, from
the backend folder.

## The interface

All of it lives in `sdk/src/backend/api.ts`. Types not defined here come from
`sdk/src/api.ts` (`MemberMedia`, `LocalMemberMedia`, `LocalMediaInputs`,
`ResolvedTransport`), `sdk/src/config.ts` (`SessionTimings`),
`sdk/src/encryption.ts` and matrix-js-sdk (`Transport`,
`CallMembershipIdentityParts`). Memberships reach a backend as the SDK's
`RTCMembership`, whose pick covers the two things a backend reads,
`rtcBackendIdentity` and `getTransport()`. The js-sdk session itself never reaches a
backend: `MatrixKeyProvider` reads three things from it today, the
`EncryptionKeyChanged` event, one `reemitEncryptionKeys()` call to replay the
keys it already holds, and the room id for a log line, and `mediaKeys$` covers
all three.

### Connection state, backend neutral

Replaces `ConnectionState` from `Connection.ts` inside the session. The LiveKit
backend maps its room state onto it; `Reconnecting` and `SignalReconnecting` both
become `Reconnecting`.

```ts
export enum MediaConnectionState {
  /** No connection attempt yet, or no connection at all. */
  Initialized = "initialized",
  /** Fetching whatever the connection needs first; the SFU token for LiveKit. */
  Preparing = "preparing",
  Connecting = "connecting",
  Connected = "connected",
  Reconnecting = "reconnecting",
  Disconnected = "disconnected",
  Stopped = "stopped",
}
```

### What the session hands the backend

```ts
export interface MediaBackendContext {
  roomId: string;
  ownMembershipIdentity: CallMembershipIdentityParts;
  /** What the local member publishes; the exact type is below. */
  localMedia: LocalMediaInputs;
  encryptionSystem: EncryptionSystem;
  /**
   * Every media key the session knows: the current ones replayed on
   * subscribe, new ones as they arrive. The backend feeds them into its own
   * frame encryption. Empty for a shared key, which is in `encryptionSystem`.
   */
  mediaKeys$: Observable<MediaKey>;
  /** For the delegated leave's timeout, and whatever else a backend times. */
  timings: SessionTimings;
  logger: Logger;
}

/** One per-participant media key, as the js-sdk's `EncryptionKeyChanged` carries it. */
export interface MediaKey {
  /** The `rtcBackendIdentity` of the member the key belongs to. */
  participantId: string;
  index: number;
  key: Uint8Array;
}

/**
 * The type of the `backend` option: a function the session calls once with
 * its scope and the context to get the backend. Only an alias, so the option
 * and a second backend's module do not spell the signature out. A backend's
 * own factory keeps the codebase's shape,
 * `createLivekitBackend(scope, context, options): MediaBackend`, and the host
 * closes over its options: `(scope, ctx) => createLivekitBackend(scope, ctx,
 * { client, tokenEndpoint: "msc4195" })`. No currying, so `createX` returns
 * an X here as everywhere else.
 *
 * The Matrix client is not in the context: a backend that needs it takes it in
 * its own options, as a `Pick` of exactly what it calls, so the type says what
 * each backend reaches for. LiveKit picks the OpenID token and the base URL;
 * a mesh backend would pick to-device sending.
 */
export type MediaBackendFactory = (
  scope: ObservableScope,
  context: MediaBackendContext,
) => MediaBackend;
```

`LocalMediaInputs` is unchanged from `sdk/src/api.ts` and is the only input the
backend reads about the local media. Since the `MemberMediaPlan.md` slices, the
devices and the processor are no longer behaviors the SDK watches: they are
fields of the initial requests, and later changes go to the track's own
`setDevice` and `setProcessor`.

```ts
export interface LocalMediaInputs {
  /** Published at the join; `publish` on the local member adds to it from then on. */
  publish: PublishRequest[];
  /** Undefined where the host routes audio itself, or to leave the browser's choice. */
  audioOutputDeviceId$: Behavior<string | undefined>;
}

export type PublishRequest =
  | { source: "microphone"; deviceId?: string; capture?: AudioCaptureSettings }
  | {
      source: "camera";
      deviceId?: string;
      processor?: TrackProcessor<Track.Kind.Video>;
      capture?: VideoCaptureSettings;
    }
  | { source: "screenShare"; audio?: boolean; capture?: VideoCaptureSettings };
```

The processor type in the camera request is the LiveKit type on the public API;
slice 7 of the migration.

### The backend

```ts
/** What preparing the local transport established; what the MatrixRTC join needs from the media side. */
export interface TransportCapabilities {
  /**
   * Whether the backend can restart the delayed leave on the client's behalf,
   * so that a client that vanishes is removed by the backend rather than by
   * the timeout. Decides which delayed leave timings the join uses, and
   * whether `delegateDelayedLeave` is ever called.
   */
  canDelegateDelayedLeave: boolean;
}

/** One connection a backend holds. */
export interface BackendConnection {
  /** The transport as it appears in memberships; what the registry keys on. */
  transport: Transport;
  state: MediaConnectionState | Error;
  /**
   * What the backend fetched to connect; undefined until it has, and again
   * after the connection stops. One stable object per fetch, so that the
   * registry's `distinctUntilChanged` holds across state changes.
   */
  resolved: ResolvedTransport | undefined;
}

export interface MediaBackend {
  /** The membership transport type this backend serves: "livekit". */
  readonly transportType: string;

  /**
   * Makes `transport` usable as the one the local member publishes on. The
   * session found it; the backend does whatever has to succeed before it is
   * advertised in the membership. Resolves with what the join needs to know,
   * rejects with the error the session reports as fatal. Called once per
   * session. For LiveKit: the OpenID and JWT exchange, whose result the
   * backend keeps for its own connection, and the delegation probe.
   */
  prepareLocalTransport(transport: Transport): Promise<TransportCapabilities>;

  /**
   * Hands the delayed leave event to the backend, which restarts it from
   * then on. Called by the session each time the membership manager reports
   * a new delay id, only when `canDelegateDelayedLeave` is true. A rejection
   * is logged, not fatal: the client keeps restarting the leave itself.
   */
  delegateDelayedLeave(delayId: string): Promise<void>;

  /** The local member's side; the exact type is below. */
  readonly local: LocalMediaBackend;

  /**
   * The media of one remote member, null while nothing has arrived for it on
   * its transport ("waiting for media"). Built in `scope`, which the caller
   * ends with the member. The backend matches on `rtcBackendIdentity` and the
   * membership's transport, both read from `membership$`.
   *
   * This is also how the backend learns which remote transports exist: it
   * registers the membership's transport for as long as `scope` lives, and
   * connects to the union of registered transports plus the local one. No
   * membership list reaches the backend; the session decides which members
   * exist and asks for their media.
   */
  mediaFor$(
    scope: ObservableScope,
    membership$: Behavior<RTCMembership>,
  ): Behavior<MemberMedia | null>;

  /**
   * Every connection the backend holds, for diagnostics. The session's
   * transport registry derives `connectedTransports$` from the entries in
   * `Connected` state, and each `TransportMetadata.resolved$` from the entry
   * whose transport has the same canonical id, with `distinctUntilChanged`.
   */
  readonly connections$: Behavior<BackendConnection[]>;

  /**
   * A text channel beside the media. Sent on the local transport, rejected
   * while it is not connected; received on every transport. The session maps
   * `senderId` to a member and drops what no member sent.
   */
  sendData(topic: string, text: string): Promise<void>;
  readonly data$: Observable<{ senderId: string; topic: string; text: string }>;
}
```

There is no `transportId` on the backend. The session's transport registry keys
on a canonical serialisation of the raw transport object, sorted keys. Transports
are plain JSON out of membership events, so identical transports serialise
identically, and a mesh transport carrying per-member data is correctly distinct.

### The local side

This is what `createLocalMembership$` in `session/LocalMember.ts` reads instead of
`participant$`, `connection$`, `connection.livekitRoom` and the publisher. The
join state machine, the Matrix join and leave, the error aggregation, the delay
id signal and the screen share error handling stay in the session; the LiveKit
calls and the per-connection publisher lifecycle move.

```ts
export interface LocalMediaBackend {
  /**
   * State of the connection the local member publishes on. `Initialized`
   * while there is none. An `Error` is the connection's failure.
   */
  readonly connectionState$: Behavior<MediaConnectionState | Error>;

  /** The local member's own media. Null until the connection has a local participant. */
  readonly media$: Behavior<LocalMemberMedia | null>;

  /**
   * Whether the local tracks reach the transport. The session sets it to
   * "joined and the homeserver is reachable", so that a member who has left,
   * or who may already have been dropped from the session, is not heard.
   * Remembered across connections and applied to each new one: the tracks
   * are created on the first `true`, and their upstream is paused while
   * `false`, so the local preview stays live while nothing is heard.
   */
  setPublishing(publish: boolean): void;
  /** The first failure to publish, kept until the session ends. Not fatal. */
  readonly publishError$: Behavior<Error | null>;

  /**
   * Publishes a source and resolves with its track once it is in `media$`'s
   * `tracks$`. Remembered across connections, so a request before the
   * transport is up is applied when the connection comes, and republished
   * after a reconnection. Rejects where the device could not be used,
   * including the user closing the screen picker. Today's `DesiredMedia`
   * map lives behind this.
   */
  publish(
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack>;
  /** Removes one of our tracks by id; a screen share takes its audio with it. */
  unpublish(id: string): Promise<void>;
}
```

Muting, device switching and the processor are not on the backend: they are
methods of `LocalAudioMediaTrack` and `LocalVideoMediaTrack`, which the backend
builds in `media$`. The `setEnabled` callback that `createLocalLivekitMemberMedia`
takes today, so that a track's mute keeps the desired map in step, is wired
inside the backend. Screen sharing has no members of its own any more: it is a
`publish` request, and "sharing" is `tracks$` holding a `screenShare` track.

There is one publish switch, not two. Today `LocalMember.ts` pauses the
upstream from two places: `stopPublishing()` on leave, and a separate
subscription on the homeserver connectivity that pauses every publication while
the sync is down and resumes every publication when it is back. Both are the
same LiveKit operation, and the second does not look at the join intent: after
`leave()` the tracks still exist with their upstream paused, so a sync hiccup
resumes them and a member who has left is heard again. The session computes
the one boolean, joined and reachable, and the backend applies it. The cost is
that the tracks are now created on the first `true`, so a join while the sync is
down waits for the sync before asking for devices. A join cannot send its
membership without the sync either, and pre-join track creation is slice 6's.

There is no publisher on the interface. Today's `Publisher` wraps one LiveKit
room's local participant and so lives and dies with the local connection, and
`LocalMember.ts` re-applies the join intent to each new one. That lifecycle is a
LiveKit detail: the backend keeps the publish intent, as it keeps the desired
requests for `publish`, and re-applies both to every connection it opens. A
mesh backend has no publisher object at all.

### Delayed leave delegation

How it works today, all in `LocalMember.ts` and `openIDSFU.ts`:

1. The js-sdk membership manager sends the membership and a delayed leave event,
   and emits the leave's delay id (`MembershipManagerEvent.DelayIdChanged`), again
   whenever it has to send a new one. `MatrixRTCClient.ts` turns that into
   `delayId$`.
2. When the local transport is known, the session probes two MSC4195 endpoints
   without credentials: the homeserver's
   `/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`
   and the transport's `<livekit_service_url>/delegate_delayed_leave`. A 404 means
   no support. Either one supporting it is enough.
3. The join uses `timings.delegatedDelayedLeave` if supported, else
   `timings.delayedLeave`. The difference is an hour versus eighteen seconds of
   delay, because a delegated leave is restarted by the SFU and the client stops
   restarting it.
4. On every delay id, if supported, the session calls the token service again with
   `delay_id`, `delay_timeout` and the homeserver's URL. The token it returns is
   discarded; the request is the handover. Failure is logged and the client keeps
   restarting the leave itself.

Steps 1 and 3 are MatrixRTC and stay in the session. Steps 2 and 4 are the LiveKit
token protocol and move behind the interface, as two members rather than one:

- The probe goes into `prepareLocalTransport`, reported as `canDelegateDelayedLeave`.
  It needs the transport's URL and the homeserver's, both of which the backend has
  at that moment, and the join needs its answer before it fires. The backend runs
  the probe concurrently with the token fetch, as today.
- The handover is `delegateDelayedLeave(delayId)`, because the delay id arrives
  after the join and changes over the session's life. The session owns that signal
  and drives the method from it.

The session side after the change:

```ts
// discoverLocalTransport is the session's; see "Discovery stays in the session"
const prepared$ = from(
  discoverLocalTransport(client, backend.transportType, options, logger).then(
    async (transport) => ({
      transport,
      ...(await backend.prepareLocalTransport(transport)),
    }),
  ),
); // errors become fatalTransportError$

scope.reconcile(
  combineLatest([prepared$, joinRequested$]),
  ([prepared, join]) => {
    if (prepared === null || !join) return;
    joinMatrixRTC(
      prepared.transport,
      prepared.canDelegateDelayedLeave
        ? timings.delegatedDelayedLeave
        : timings.delayedLeave,
    );
    return leaveOnCleanup;
  },
);

scope.reconcile(
  combineLatest([prepared$, delayId$]),
  async ([prepared, delayId]) => {
    if (!prepared?.canDelegateDelayedLeave || delayId === null) return;
    try {
      await backend.delegateDelayedLeave(delayId);
    } catch (e) {
      logger.error("Failed to delegate the leave", e);
    }
  },
);
```

A mesh backend answers `canDelegateDelayedLeave: false` and is never asked to
delegate. Should a backend later delegate to something other than a token
service, it does so behind the same method.

### Lifetimes: what ends what

`mediaFor$` is bound to the scope it is given, not to its subscribers.
`scope.behavior` subscribes eagerly and tears down with the scope, so the
behavior and the transport registration live exactly as long as the member
does, whether or not a view reads them. Lazy registration on first subscribe
would be wrong: the audio renderer needs the microphone track of a member
nobody has a tile for, and that member's transport would never connect.

- **A remote member leaves.** `generateItems` ends the member's scope. From
  that one scope the `mapScoped` item ends and detaches the `MemberMedia`, the
  behavior completes, and the `onEnd` callback releases the transport. If the
  count for that transport hits zero the connection manager drops it, and the
  connection's own scope ending calls `stop()`, as today.
- **A member changes transport.** Registration follows `membership$` with
  `distinctUntilChanged` on the transport id: release the old, register the
  new, inside the same scope.
- **The local member calls `leave()`.** Nothing changes on the remote side.
  The memberships are still in the room, so the members still exist and the
  connections stay open. That is today's behaviour too: the connection
  manager never looked at `joinRequested$`.
- **The network drops.** The member still exists, so `mediaFor$` is live. The
  connection reports reconnecting, its participant list empties, the
  participant behind the member becomes null, the media item ends and
  `media$` reads null, "waiting for media". A new `MemberMedia` is built on
  reconnect. As today.
- **The session scope ends.** The backend and every member scope end in the
  same tick, in subscription order, so the backend's internals tear down
  before the members' release callbacks run. Release must therefore do
  nothing but update the registry map and `next` a subject, both no-ops with
  nobody listening. It must never stop a connection or touch LiveKit itself;
  the connection scopes do that.

### Where the LiveKit backend gets each member from

| Interface member                       | Today                                                                                                                                                                                             | Moves from                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `prepareLocalTransport`                | OpenID and JWT fetch kept as `existingSFUConfig`, delegation probe                                                                                                                                | `LocalTransport.ts`, `LocalMember.ts`                                                                         |
| `delegateDelayedLeave`                 | `getSFUConfigWithOpenID` with `delayId`                                                                                                                                                           | `LocalMember.ts`                                                                                              |
| `local.connectionState$`               | `connection$.state$` for the local transport                                                                                                                                                      | `LocalMember.ts`                                                                                              |
| `local.media$`                         | `mediaFor(participant$, connection$)` with `createLocalLivekitMemberMedia`                                                                                                                        | `Members.ts`                                                                                                  |
| `local.setPublishing`, `publishError$` | `scope.reconcile(connection$, createPublisher)`, the `[publisher$, joinRequested$]` reconcile with its `publishError$`, and the homeserver-connectivity loop over `participant.trackPublications` | `LocalMember.ts`, `MatrixRTCClient.ts`                                                                        |
| `local.publish`, `unpublish`           | `publish` and `unpublish` with the `DesiredMedia` map and `publication$`, and the `trackSid` to track lookup                                                                                      | `LocalMember.ts`, `Members.ts`, `Publisher.ts`                                                                |
| internal                               | the `setEnabled(source, enabled)` callback into `createLocalLivekitMemberMedia`                                                                                                                   | `LocalMember.ts`, `Members.ts`                                                                                |
| `mediaFor$`                            | `createRemoteMatrixLivekitMembers$` matching plus `mediaFor`                                                                                                                                      | `Members.ts`, `MatrixLivekitMembers.ts`                                                                       |
| `connections$`                         | `connectionManagerData$` joined with each connection's `state$` and `ResolvedConnection.resolved$`                                                                                                | `Transports.ts`, `ConnectionFactory.ts`                                                                       |
| `sendData`, `data$`                    | `createDataChannel$` minus the member lookup                                                                                                                                                      | `DataChannel.ts`                                                                                              |
| internal                               | key provider on `mediaKeys$` instead of `setRTCSession`, room options, E2EE worker, connection manager fed by the transports registered through `mediaFor$`                                       | `KeyProvider.ts`, `MatrixKeyProvider.ts`, `livekitOptions.ts`, `ConnectionFactory.ts`, `ConnectionManager.ts` |

### Discovery stays in the session

Which transport the local member advertises is answered by the homeserver's
MSC4143 transport list, and that list can name transports of any type. So
discovery is the session's, in `session/LocalTransport.ts`, and a backend is
only asked to prepare what the session picked:

```ts
/** In session/LocalTransport.ts. The homeserver's list, retried, filtered to what the backend serves. */
export async function discoverLocalTransport(
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">,
  transportType: string,
  options: Pick<
    MatrixRTCClientOptions,
    "transportUrl" | "fallbackTransportUrl"
  >,
  logger: Logger,
): Promise<Transport>; // throws MatrixRTCTransportMissingError
```

`RtcTransportAutoDiscovery` does the list fetch today and stays where it is,
with its `isLivekitTransport` filter replaced by a filter on `transportType`.

The two URL options are the awkward part. `transportUrl` and
`fallbackTransportUrl` are LiveKit service URLs, and turning a URL into a
membership transport means building `{ type: "livekit", livekit_service_url }`.
That is LiveKit knowledge, but it is a workaround for hosts that configure a URL
rather than a transport, and it lives in `discoverLocalTransport`, not in
`backend/livekit/`. The backend folder never learns where its transport came
from. It is one `Transport` literal and the js-sdk's `LivekitTransport` type,
no `livekit-client` import, so the lint guard of step 6 is not affected. The
clean follow-up, outside this plan, is `transport?: Transport` and
`fallbackTransport?: Transport` on the client options, with the host building
the literal; then the workaround is deleted.

### LiveKit's own options

`mediaQuality` and `capture` on `MatrixRTCClientOptions` configure LiveKit, not
MatrixRTC. They become `LivekitBackendOptions`, the third parameter of
`createLivekitBackend(scope, context, options)`, together with the slice of the
Matrix client the backend calls. They also stay on `MatrixRTCClientOptions`, where they feed the
default backend when the host passes no `backend`, so Element Call's
`InCallView` does not change. A host that supplies its own backend configures
it itself, client included. `transportUrl` and `fallbackTransportUrl` are
discovery inputs and stay on the client options for good, as above.

```ts
export interface LivekitBackendOptions {
  /**
   * `getOpenIdToken` for the token exchange, `baseUrl` for the delegation
   * probe and handover. Nothing else: discovery is the session's. This is
   * today's `OpenIDClientParts` from `openIDSFU.ts` minus its unused
   * `getDeviceId`, plus `baseUrl`.
   */
  client: Pick<MatrixClient, "getOpenIdToken" | "baseUrl">;
  mediaQuality?: MediaQuality;
  /**
   * Which token service endpoint to use for the local transport: the MSC4195
   * one, or the legacy one with the old identity format. Remote transports
   * always try both. The default backend derives it from the client's
   * `matrixRTCMode`; the mode itself never reaches a backend, since what it
   * also decides, sticky events and the member id format, is the session's.
   */
  tokenEndpoint: "msc4195" | "legacy";
}
```

Today `openIDSFU.ts` takes the `MatrixRTCMode` itself and reads the endpoint
choice off it. Step 5 changes it to take `tokenEndpoint`, with the mapping
`Matrix_2_0` to `msc4195` and `Compatibility` to `legacy` done once where the
default backend is built, in `MatrixRTCClient.ts`, which also hands the
client through. The exported `authenticateWithTransport` keeps its signature by
doing the same mapping.

## Transition

Six steps, each green on its own and each a PR of under 400 lines. There is one
connection manager at every point: the backend owns it from step 2 on, and the
consumers not yet switched read it through a transitional field until step 4
removes it. Running the old wiring and the backend side by side would open a
second connection to every SFU, so the plan never does that.

### Step 1: carve the folder

Pure move, no code change beyond import paths.

- `git mv` into `sdk/src/backend/livekit/`: `media/*`, `Connection`,
  `ConnectionFactory`, `ConnectionManager`, `DataChannel`, `KeyProvider`,
  `MatrixKeyProvider`, `MatrixLivekitMembers`, `Publisher`, `publishOptions`,
  `livekitOptions`, `openIDSFU`, each with its test. `utils/tracks.ts` is
  neutral and stays. `RtcTransportAutoDiscovery` and
  `LocalTransport` stay in `session/`.
- Split `utils/test.ts`: `mockRemoteParticipant` and `exampleTransport` go to
  `backend/livekit/test.ts`.
- `index.ts` re-exports `authenticateWithTransport` from the new path.

Check: `pnpm lint`, `pnpm test`, the `playwright/sdk` specs.

### Step 2: the interface, the backend shell, the registry, the data channel

- Add `sdk/src/backend/api.ts` with the types above.
- Add `sdk/src/backend/livekit/LivekitBackend.ts` exporting
  `createLivekitBackend(scope, context, options): MediaBackend`. It owns what
  `MatrixRTCClient.ts` builds today: the key provider, the
  `LivekitConnectionFactory` and the connection manager. Until step 3 the
  connection manager is still fed from `membershipsAndTransports$`, passed in
  as a transitional `remoteTransports$` input beside the transitional
  `connectionManager` field; both go in step 3. It implements
  `transportType`, `connections$`, `sendData` and `data$`. `ResolvedConnection`
  keeps one `ResolvedTransport` object per fetch instead of rebuilding it on
  every state change.
- `MatrixRTCClient.ts` creates the backend, takes the connection manager from
  it, and maps `data$` senders to members itself. It builds `mediaKeys$` from
  the js-sdk session: `fromEvent(EncryptionKeyChanged)` with a
  `reemitEncryptionKeys()` call on subscribe. `MatrixKeyProvider` subscribes
  to that instead of taking the session; its test feeds a `Subject`.
- `Transports.ts` derives both `connected$` and each `TransportMetadata.resolved$`
  from `backend.connections$`, keys the registry on the canonical JSON of the
  raw transport, and loses `ResolvedConnection`, `isLivekitTransport` and
  `ConnectionState`.

New unit test: `LivekitBackend.test.ts` with a fake LiveKit room through the
existing `livekitRoomFactory` seam, covering `connections$` through a connect,
a reconnect and a stop, and the data channel.

### Step 3: remote media

- Implement `mediaFor$` in the LiveKit backend. It registers the membership's
  transport, following `membership$` and released when `scope` ends; looks
  the transport and identity up in `connectionManagerData$`;
  `distinctUntilChanged` on the participant and room pair; then `mapScoped`
  into `createLivekitMemberMedia`. The "participant matched or missing" log
  line moves here.
- The connection manager's `remoteTransports$` becomes the registered set:
  a `Map` of transport id to count, exposed as a behavior of its keys, with
  `membershipsAndTransports$`'s LiveKit filter and dedup applied there. The
  transitional input from step 2 goes.
- `Members.ts` drops `mediaFor` and the participant and room parameters;
  `createRemoteRTCMember` takes `backend.mediaFor$(scope, membership$)`.
- `MatrixRTCClient.ts` generates `remoteMembers$` straight from `memberships$`
  minus the local one, keyed by `membershipKeys`, and stops using
  `createRemoteMatrixLivekitMembers$`. `membershipsAndTransports$` is deleted
  from `SessionBehaviors.ts`.

The epoch pairing that `createRemoteMatrixLivekitMembers$` does today is not
needed any more. It existed to keep a membership list and the connection data
from different ticks apart; now a member's media depends on its own membership
only, and the connections exist because members asked for them. A connection
that does not exist yet reads as null, which is "waiting for media" and correct.
What has to hold is that `MemberMedia` instances stay stable while the
participant and room do not change, which the `distinctUntilChanged` above
guarantees, and that a transport stays registered while any member names it,
which the count does. `media.spec.ts` is the check that nothing flickers.

New unit test in `LivekitBackend.test.ts`: two members on one remote transport
open one connection, it survives the first member's scope ending, and closes
with the second's.

### Step 4: local media

- Implement `local` in the LiveKit backend: `connectionState$` from the local
  transport's connection mapped onto `MediaConnectionState`, `media$` through
  `createLocalLivekitMemberMedia`, `setPublishing` and `publishError$` by
  reconciling a `Publisher` per connection against the remembered intent,
  which is the two reconciles from `LocalMember.ts` moved as they are, and
  `publish` and `unpublish` over a backend-owned `DesiredMedia` map and the
  current publisher, with the `trackSid` to track lookup that `Members.ts`
  does today done inside. The `setEnabled` callback into
  `createLocalLivekitMemberMedia` is wired here too. The
  homeserver-connectivity loop is not moved; `setPublishing` covers it.
- `LocalMember.ts` takes `backend.local` instead of `connectionManager`,
  `createPublisher` and `desired`. Its publisher reconcile and the pause and
  resume loop become one subscription,
  `joinRequested$ && homeserverConnected.combined$` into
  `backend.local.setPublishing`, and `backend.local.publishError$` feeds
  `state$` where the local subject did. It loses `participant$`,
  `connection$`, the `livekitRoom` access, the pause and resume loop,
  `publish`, `unpublish`, `setEnabled` and `publication$`, and compares
  against `MediaConnectionState.Connected` in `mediaState$` and
  `disconnectReason$`. `LocalMembership` shrinks to the join state machine
  and no longer names a LiveKit type.
- `Members.ts`: `createLocalRTCMember` forwards `publish` and `unpublish` to
  `backend.local` and drops its own `trackSid` lookup.
- `MatrixRTCClient.ts` stops passing `createPublisher`, `desired` and the
  connection manager, and stops building the `DesiredMedia` map. The
  transitional field goes.
- `status.test.ts` moves to `MediaConnectionState`.

New unit test: `LocalMember.test.ts` against a fake `LocalMediaBackend`. This is
the first time the local state machine is testable without LiveKit; cover join
before the connection is up, connection loss while publishing, a sync outage
after `leave()` leaving `setPublishing` at false, and a rejected
local transport.

### Step 5: the local transport and the delegation

- `session/LocalTransport.ts` becomes `discoverLocalTransport` as above: the
  URL override, else `RtcTransportAutoDiscovery` filtered on the backend's
  type, else the fallback URL. The token fetch leaves it, and so does the
  `LocalTransport` pair type with its `sfuConfig`.
- `RtcTransportAutoDiscovery` takes a `transportType` and returns a
  `Transport`; its `isLivekitTransport` filter goes.
- Implement `prepareLocalTransport` in the LiveKit backend from the token
  fetch in `getLocalTransport` and the two `checkDelegationSupport` calls,
  the probe running concurrently with the token fetch. The SFU config is
  kept for the local connection, keyed by service URL, replacing
  `existingSFUConfig` flowing through `LocalTransport`.
- Implement `delegateDelayedLeave` from the handover `reconcile` in
  `LocalMember.ts`.
- `MatrixRTCClient.ts` chains discovery and preparation into `prepared$` as
  sketched above.
- `LocalMember.ts` takes `prepared$` instead of `localTransport$`, drops
  `joinParams$`, `checkDelegationSupport`, `client`, `roomId`,
  `ownMembershipIdentity` and `matrixRTCMode` from its props, and drives
  `backend.delegateDelayedLeave` from `delayId$`.
- `joinJsSdkSession` takes a `Transport`. `encryptMedia` derives from
  `encryptionSystem.kind`, not from whether a key provider exists.

New unit tests: in `LivekitBackend.test.ts`, the probe outcomes (homeserver
supports it, only the transport does, neither, probe throws) and the handover
request body; in `LocalMember.test.ts`, that the join picks the delegated timings
and that a new delay id triggers a handover.

### Step 6: the `backend` option and the guard

- `MatrixRTCClientOptions.backend?: MediaBackendFactory`. When absent,
  `MatrixRTCClient.ts` supplies
  `(scope, ctx) => createLivekitBackend(scope, ctx, livekitOptions)`, with
  `livekitOptions` built from the client and the LiveKit options on the client
  options.
- Extend `eslint/SdkImportBoundary.js`: under `sdk/src/session/`, in
  `sdk/src/api.ts` and in `sdk/index.ts`, `livekit-client` and `@livekit/*` are
  banned except as `import type`. From here on the seam is enforced, not
  documented.
- `SdkArchitecture.md` gets a "Media backend" section built from this plan, the
  README's description of what imports LiveKit is updated, and `SdkMigration.md`
  records the slice as done.

## After this

- Full mesh or a cascading SFU is a new folder under `sdk/src/backend/` with
  its own `createMeshBackend(scope, context, options)`, handed in as a
  `MediaBackendFactory`; nothing in `session/` changes.
- A member whose transport type has no backend gets null media. That is what
  happens today through the `isLivekitTransport` filter; now it is explicit.
- Slice 7, the neutral processor type, and slice 11, the error renames, each
  touch one folder.
- Several backends at once, grouping memberships by transport type, fits the
  interface but is out of scope until a second backend exists.
