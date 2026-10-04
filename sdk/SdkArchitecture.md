# MatrixRTC SDK architecture

`@element-hq/matrixrtc-sdk` is the model under Element Call, on its own: one
`MatrixRTCClient` per room that joins and leaves the MatrixRTC session, discovers
and connects to the media transports, publishes the local media, distributes the
encryption keys, and hands out every member with its media as observables. It has
no UI, reads no configuration and no settings, and never names LiveKit in its
interface.

Element Call becomes one consumer of it: `CallViewModel` keeps what makes a session
a _call_ (ringing, auto-leave, layout, sounds, reactions, settings, the host
bridge) and takes everything else from the client. The dependency direction is
therefore `Element Call → sdk`, never the reverse. The migration from today's
`CallViewModel` to that shape is in [`SdkMigration.md`](./SdkMigration.md).

## The architecture

```
 host application (Element Call, a whiteboard, watch-together, …)
   │
   │  createMatrixRTCClient(scope, matrixClient, room, localMedia, options)
   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ MatrixRTCClient                                                              │
│                                                                              │
│   public API, all Behaviors:                                                 │
│     join() leave() status$ connected$ reconnecting$ fatalError$              │
│     localMember$ remoteMembers$ memberCount$                                 │
│     keyRotationSuppressed$ connectedTransports$                              │
│                                                                              │
│   per member    RTCMember   { id userId deviceId membership$ displayName$    │
│                               avatarUrl$ transport$ media$ }                 │
│   per media     MemberMedia { tracks$ encryptionError$ }                     │
│   per track     MediaTrack  { source kind muted$ encrypted$ stats$ attach() }│
│                                                                              │
│  ┌──────────────────────────┐   memberships    ┌───────────────────────────┐ │
│  │ MatrixRTC core           │ ───────────────▶ │ transports                │ │
│  │ (js-sdk MatrixRTCSession,│   transports     │                           │ │
│  │  later the rust-rtc      │                  │ ConnectionManager         │ │
│  │  crate behind a bridge)  │                  │   one Connection per      │ │
│  │                          │                  │   transport url           │ │
│  │ memberships from room    │                  │ Connection                │ │
│  │   state and sticky events│                  │   OpenID → JWT → LiveKit  │ │
│  │ own membership, delayed  │                  │   room, participants,     │ │
│  │   leave, retries         │   media keys     │   tracks                  │ │
│  │ media keys over          │ ───────────────▶ │ Publisher                 │ │
│  │   to-device messages     │   (key provider) │   local tracks, upstream  │ │
│  └──────────────────────────┘                  └───────────────────────────┘ │
│                   │                                          │               │
│                   └──── RTCMember = membership + participant ─┘               │
│                         matched on rtcBackendIdentity = LiveKit identity     │
└──────────────────────────────────────────────────────────────────────────────┘
   │                                                            │
   ▼                                                            ▼
 MatrixClient (sync, room state, to-device, OpenID)         LiveKit SFU
```

The left box is MatrixRTC: who is in the session, with which transport, and the
keys. The right box is media: a connection to every transport any member
advertises, and our own publication on the one we advertise. The client is the
join of the two: a member exists once its membership does, and gets its media once
a participant with the matching identity shows up on the member's transport.

### How Element Call uses it

```
 Element Call, as app, widget or component
┌────────────────────────────────────────────────────────────────┐
│ views: InCallView, tiles, header, footer, settings             │
│    ▲ Behaviors                                                 │
│ CallViewModel                                                  │
│   layout, ringing and notifications, auto-leave, sounds,       │
│   reactions, hand raise, settings, audio routing, host bridge  │
│    ▲ status$, localMember$, remoteMembers$, MemberMedia        │
│ MatrixRTCClient                   @element-hq/matrixrtc-sdk    │
└────────────────────────────────────────────────────────────────┘
     │ MatrixClient + Room                        │ livekit-client
     ▼                                            ▼
 homeserver                                      SFU
```

All three modes already hold a `MatrixClient` and a `Room` by the time a call
starts: standalone after `useLoadGroupCall`, the component from the host's `client`
prop, the widget from `createRoomWidgetClient`. The view model passes them on and
builds its media view models from `RTCMember` and `MemberMedia` instead of from
LiveKit participants.

### Joining, in order

```
 host          MatrixRTCClient             homeserver / JWT service       LiveKit SFU
  │  create ───▶│                                   │                         │
  │             │ GET rtc/transports ──────────────▶│                         │
  │             │◀── preferred transport ───────────│                         │
  │             │ OpenID token, then /sfu/get ─────▶│                         │
  │             │◀── sfu url, jwt, alias, identity ─│   = resolved$ of the     │
  │             │                                   │     local transport      │
  │             │ connect(url, jwt) ───────────────────────────────────────▶│
  │  join() ───▶│                                   │                         │
  │             │ membership state event + delayed leave ──▶│                 │
  │             │ create tracks, resume upstream ──────────────────────────▶│
  │             │ media key to every other member (to-device) ──▶│           │
  │             │◀── other memberships (sync) ──────│◀── participants ────────│
  │◀─ status$ "connected", localMember$, remoteMembers$ with media$ ──────────│
```

The transport is resolved and connected before `join()`, so that the membership
can name it and the first frames go out as soon as the state event is sent. Until
`join()` the tracks exist but their upstream is paused: a host can show a preview
without anyone hearing it. `leave()` pauses the upstream again and sends the leave.

## Vocabulary

| Word              | Meaning here                                                                                                                                | Elsewhere                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| client            | a `MatrixRTCClient`: one room, one slot, one local member                                                                                   | `MatrixClient` is always written out |
| session           | the MatrixRTC session in the room: the set of memberships. Only used for the js-sdk object, which stays inside the SDK as `JsSdkRTCSession` | MSC4143                              |
| membership        | one device's MatrixRTC state event, seen by hosts as `RTCMembership`, the js-sdk `CallMembership` behind it                                 |                                      |
| member            | an `RTCMember`: a membership plus what the SDK derives from it (display name, transport, media)                                             | Element Call's "matrixLivekitMember" |
| participant       | a LiveKit participant, the media side of a member. Never leaves the SDK                                                                     |                                      |
| transport         | where media is exchanged: a LiveKit service url today, described by `TransportMetadata`                                                     | MSC4143 "focus"                      |
| application, slot | what the session is for (`m.call`) and which one of them in the room (`ROOM`)                                                               | MSC4143                              |

Names use `RTC` in capitals, as the js-sdk does: `MatrixRTCClient`, `RTCMember`,
`matrixRTCMode`.

## Reactive primitives

The whole public API is made of `Behavior`s: an rxjs observable that always holds a
current value (`.value`) and replays it on subscription. A consumer subscribes to
what it renders and reads `.value` where it needs the present state. Everything is
bound to an `ObservableScope` the host creates; ending the scope ends the client,
its connections and its tracks. Both come from the SDK (`Behavior`, `constant`,
`ObservableScope`); the host needs rxjs and nothing else.

## What a host must provide

Found the hard way while building the harness; each one fails in a way that looks
like an SDK bug.

- **The room the sync loop maintains.** `client.getRoom(roomId)` once the join has
  synced. `joinRoom` returns a detached copy for a room joined just now, and a
  client built on it never sees a member.
- **Power to send the membership event.** Every member needs to write
  `org.matrix.msc3401.call.member` (and the sticky event in Matrix 2.0 mode). A
  plain room only lets its creator send state; Element Call's rooms set the level
  to 0.
- **An encrypted room for per-participant keys.** Media keys travel in encrypted
  to-device messages, which the crypto only delivers to devices it tracks, which
  are the members of encrypted rooms. In an unencrypted room the key never arrives
  and every remote track decodes nothing.
- **A logged-in, syncing client with crypto set up**, and the transport advertised
  by the homeserver (`rtc/transports`). The SDK has no fallback url of its own.

## The client: `MatrixRTCClient`

Rule of thumb for what belongs here: if it would be the same for a different
application on top of the same MatrixRTC session, it is in the client. If it is
specific to calls, or depends on the window, a setting, a platform, or a React
context, it is in the view model.

### Creating one

```ts
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { type RTCNotificationType } from "matrix-js-sdk/lib/matrixrtc";

export interface MatrixRTCClientOptions {
  encryptionSystem: EncryptionSystem;
  /** Resolved by the host; the SDK reads neither config.json nor settings. */
  matrixRTCMode: MatrixRTCMode;
  /**
   * MSC4075 notification sent with the join. A parameter of the MatrixRTC
   * join itself, so it is here even though it is named after calls; reacting
   * to a notification (ringing, timeouts, declines) is the application's job.
   */
  sendNotificationType?: RTCNotificationType;
  /** The application the session belongs to, as named in the membership. Default `m.call`. */
  application?: string;
  /** The application's slot in the room. Default `ROOM`. */
  slot?: string;
  /**
   * Whatever the application wants to say about itself in the membership.
   * Opaque to the SDK. Today the js-sdk carries one key, `m.call.intent`
   * (`"audio"` or `"video"`); anything else is dropped until it can.
   */
  applicationData?: Record<string, unknown>;
  /** Session timings the host has configured; the defaults otherwise. */
  timings?: Partial<SessionTimings>;
  /** Limits on what is published; LiveKit's defaults otherwise. */
  mediaQuality?: MediaQuality;
  /** Use this transport instead of asking the homeserver. */
  transportUrl?: string;
  /** Use this transport when the homeserver advertises none. */
  fallbackTransportUrl?: string;
}

/**
 * One thing to publish: a source, where to capture it from and how to encode
 * it. Where the device and the settings are left out, the browser's and
 * LiveKit's defaults apply.
 */
export type PublishRequest =
  | { source: "microphone"; deviceId?: string; capture?: AudioCaptureSettings }
  | {
      source: "camera";
      deviceId?: string;
      /** Background blur and the like. */
      processor?: TrackProcessor<Track.Kind.Video>;
      capture?: VideoCaptureSettings;
    }
  | {
      source: "screenShare";
      /** Whether to capture the screen's audio too. Default true. */
      audio?: boolean;
      capture?: VideoCaptureSettings;
    };

/**
 * Device enumeration, permission prompts and the lobby preview stay with the
 * host.
 */
export interface LocalMediaInputs {
  /** Published at the join; `publish` on the local member adds to it from then on. */
  publish: PublishRequest[];
  /** Undefined where the host routes audio itself, or to leave the browser's choice. */
  audioOutputDeviceId$: Behavior<string | undefined>;
}

/**
 * Takes the whole MatrixClient, not a narrow pick, and finds the MatrixRTC
 * session itself. The js-sdk is the MatrixRTC implementation today; when the
 * rust-rtc crate replaces it, the SDK has to bridge the crate to the js-sdk
 * client (events, state, to-device, delayed events, OpenID), and only the SDK
 * knows what that bridge needs. Holding the client keeps that change inside
 * the SDK. The js-sdk session is not part of the public API.
 *
 * The room has to be the one the client's sync loop maintains; see "What a
 * host must provide".
 */
export function createMatrixRTCClient(
  scope: ObservableScope,
  client: MatrixClient,
  room: Room,
  localMedia: LocalMediaInputs,
  options: MatrixRTCClientOptions,
): MatrixRTCClient;
```

### The client

```ts
export type ConnectionStatus =
  | "waitingForTransport"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/** Why the client is not connected: the first failing of its three links. */
export type DisconnectReason = "sync" | "membership" | "probablyLeft" | "media";

/**
 * An error raised by the client. `code` and `category` say what went wrong in
 * a form a host can translate; `cause` holds the backend's error.
 */
export class MatrixRTCError extends Error {
  code: ErrorCode;
  category: ErrorCategory;
}

export interface MatrixRTCClient {
  join(): void;
  leave(): void;
  /** The local member's state machine, collapsed to what a host shows. */
  status$: Behavior<ConnectionStatus>;
  /** Connected to the homeserver, the session and the local transport, all three. */
  connected$: Behavior<boolean>;
  /** Connected once, and currently not. */
  reconnecting$: Behavior<boolean>;
  /** Null while connected, the first failing link otherwise. */
  disconnectReason$: Behavior<DisconnectReason | null>;

  /**
   * A transport, Matrix or connection error that stops the session. Null
   * while fine. A failed publication is not fatal: the member can still
   * receive, so it stays on the local member's media.
   */
  fatalError$: Behavior<MatrixRTCError | null>;

  /** Null until our own membership has been seen in the room. */
  localMember$: Behavior<LocalRTCMember | null>;
  remoteMembers$: Behavior<RemoteRTCMember[]>;
  /** `remoteMembers.length`, plus one for the local member once it exists. One per membership, so one user may count several times. */
  memberCount$: Behavior<number>;

  /**
   * Whether the session has grown large enough that MatrixRTC has stopped
   * rotating the media encryption key.
   */
  keyRotationSuppressed$: Behavior<boolean>;

  /**
   * Transports the client currently holds a live connection to. The
   * connections themselves stay internal; this is what a developer panel
   * needs.
   */
  connectedTransports$: Behavior<TransportMetadata[]>;

  /**
   * Sends a short text to every member on the local transport, over a
   * reliable data channel beside the media. A packet holds about 15 KiB;
   * anything larger belongs in a room event. Rejects while the local
   * transport is not connected. Encrypted on the wire like the media, but
   * not end to end with the media key.
   */
  sendData(topic: string, text: string): Promise<void>;
  /**
   * What remote members sent with `sendData`, on every transport the client
   * is connected to. A message from an identity that is not a member is
   * dropped, so a host only ever hears from attested members.
   */
  data$: Observable<DataMessage>;
}

/** One `sendData` call as it arrives at a remote member. */
export interface DataMessage {
  member: RemoteRTCMember;
  topic: string;
  text: string;
}
```

### Members

```ts
/**
 * What a membership says, as hosts read it. The js-sdk `CallMembership` is
 * behind it; anything beyond this is the js-sdk's API, not the SDK's.
 */
export type RTCMembership = Pick<
  CallMembership,
  | "userId"
  | "deviceId"
  | "memberId"
  | "rtcBackendIdentity"
  | "application"
  | "applicationData"
  | "getTransport"
  | "transports"
  | "createdTs"
  | "getAbsoluteExpiry"
>;

export interface RTCMember {
  local: boolean;
  /**
   * The identity the media backend knows this member by: the membership's
   * `rtcBackendIdentity`, which is `${userId}:${deviceId}` before sticky
   * events and a hash of the member id in Matrix 2.0 mode.
   */
  id: string;
  userId: string;
  deviceId: string;
  membership$: Behavior<RTCMembership>;
  /**
   * Matrix room state rather than MatrixRTC, but the SDK already holds the
   * room and every consumer wants them next to the membership. Disambiguated
   * among the members of the session.
   */
  displayName$: Behavior<string>;
  avatarUrl$: Behavior<string | undefined>;
  /** Which transport this member is on; undefined when the membership names none. */
  transport$: Behavior<TransportMetadata | undefined>;
  /**
   * Null while the member has a transport but no participant has shown up on
   * it yet ("waiting for media"). Hand raise and reactions are room events
   * keyed by member and stay with the host for now; they are the obvious next
   * fields here.
   */
  media$: Behavior<MemberMedia | null>;
}

export interface RemoteRTCMember extends RTCMember {
  local: false;
}

export interface LocalRTCMember extends RTCMember {
  local: true;
  media$: Behavior<LocalMemberMedia | null>;
  /**
   * Publishes a source and resolves with its track once it is in `tracks$`.
   * Before the transport is connected the request is remembered and applied
   * once it is. Rejects where the device could not be used, including the
   * user closing the picker. One publication per source: publishing a source
   * again unmutes it.
   */
  publish(
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack>;
  /** Removes one of our tracks; a screen share takes its audio with it. */
  unpublish(id: string): Promise<void>;
}
```

### Transports

```ts
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";

/**
 * One transport advertised in a membership. Transport independent: `type` and
 * `id` are all the SDK needs; `raw` and `resolved$` are there for a
 * backend-specific developer panel and for connection diagnostics. One object
 * per transport, however many memberships name it.
 */
export interface TransportMetadata {
  /** `"livekit"` today. */
  type: string;
  /** Stable key, unique per transport in the session. For LiveKit, the service url. */
  id: string;
  /** The transport object as it appears in the membership, e.g. `{ type, livekit_service_url }`. */
  raw: Transport;
  /**
   * What the backend had to fetch before it could connect. Undefined until
   * the connection has resolved it, and again after the connection stops or
   * fails. The local transport resolves before the join, since the membership
   * needs it; remote ones when their connection starts.
   */
  resolved$: Behavior<ResolvedTransport | undefined>;
}

export type ResolvedTransport =
  | {
      type: "livekit";
      /** The SFU websocket url, as opposed to the JWT service url in `raw`. */
      url: string;
      /** A secret: fit for a developer panel, never for a log line. */
      token: string;
      roomAlias: string;
      identity: string;
    }
  | { type: string; [key: string]: unknown };
```

### Call-specific things kept out of the client

Checked against `CallViewModel` and its options. These stay in Element Call because
they only make sense for a call:

| Today                                                                                                        | Why it is call-specific                                                                              | Where it lives instead                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `autoLeave$` / `AutoLeaveReason` (`"allOthersLeft" \| "timeout" \| "decline"`)                               | hanging up because the other side declined or everyone left is call etiquette, not session semantics | `CallViewModel.leave$`, built from `remoteMembers$` and the room timeline                           |
| `ringAttempts$`, `createCallNotificationLifecycle$`, `createSentCallNotification$`, `createReceivedDecline$` | ringing, pickup timeouts and decline events are MSC4075 call-notify UX                               | `src/state/CallViewModel/CallNotificationLifecycle.ts`, fed by `remoteMembers$` and the Matrix room |
| `waitForCallPickup`, `autoLeaveWhenOthersLeft` options                                                       | inputs to the above                                                                                  | `CallViewModelOptions`                                                                              |
| `hideScreensharing` option                                                                                   | a UI policy; the session can always share a screen if the platform can                               | `CallViewModel` offers no screen share control                                                      |
| `ringingVm$`, `ringingStatusLocation`                                                                        | view models                                                                                          | `CallViewModel`                                                                                     |
| `hostBridge.hangUp$`, `hangup()`, `userHangup$`                                                              | widget / host integration                                                                            | `CallViewModel`                                                                                     |
| `ElementCallError`                                                                                           | carries Element Call translation keys                                                                | the view model wraps `MatrixRTCError`, reading `cause`                                              |
| `participantCount$` sound limits, join/leave sounds                                                          | call UX                                                                                              | `CallViewModel`                                                                                     |
| `callIntent`                                                                                                 | what a membership says about the call                                                                | `applicationData["m.call.intent"]`, set by the host                                                 |

Kept despite the name: `sendNotificationType`, because the js-sdk join sends the
notification as part of entering the session. Only _reacting_ to it is
call-specific.

## Media: `MemberMedia`

Every member has media. Today, in Element Call, that media _is_ a `livekit-client`
participant, handed straight through to the view models. In the SDK the participant
is wrapped in a `MemberMedia`, so that nothing outside the SDK imports
`Participant`, `TrackPublication`, `Track` or `TrackReference`. The adapter in
`sdk/src/media/` is the only place that reads a participant.

```ts
export type MediaSource =
  | "microphone"
  | "camera"
  | "screenShare"
  | "screenShareAudio"
  /** Published without a source; the application knows what it is. */
  | "unknown";

export type MediaStreamStats =
  RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined;

/** One published track of a member. */
export interface MediaTrack {
  source: MediaSource;
  kind: "audio" | "video";
  /** Stable for the life of the track. */
  id: string;
  muted$: Behavior<boolean>;
  /** False when the SFU reports the track as unencrypted. */
  encrypted$: Behavior<boolean>;
  /**
   * Inbound statistics for a remote track, outbound for a local one. Polled
   * once a second, but only while someone is subscribed, so a statistics
   * panel costs nothing while closed.
   */
  stats$: Behavior<MediaStreamStats>;
  /**
   * Rendering. The view hands its <video> or <audio> element over; the SDK
   * sets its stream and, for video, registers the size and on-screen
   * observers that pick a simulcast layer and pause the subscription while
   * the element is hidden. attach is idempotent per element; detach has to be
   * called before the element leaves the DOM so those observers are released.
   */
  attach(element: HTMLMediaElement): void;
  detach(element: HTMLMediaElement): void;
}

export interface AudioMediaTrack extends MediaTrack {
  kind: "audio";
  /**
   * Whether the track carries sound right now, as the backend measures it.
   * False while muted. A call reads this on the microphone track and calls it
   * "speaking". LiveKit measures it per member, so every audio track of a
   * member reports the same value.
   */
  isActive$: Behavior<boolean>;
  /** Route playback through Web Audio, for earpiece pan and gain. Undefined resets. */
  setAudioContext(ctx: AudioContext | undefined, plugins?: AudioNode[]): void;
  /** No-op for our own audio, which is never played back. */
  setVolume(volume: number): void;
}

export interface VideoMediaTrack extends MediaTrack {
  kind: "video";
}

/** The controls a member has over a track it publishes itself. */
export interface LocalMediaTrack {
  /** Mutes or unmutes. Resolves with the state that resulted. */
  setEnabled(enabled: boolean): Promise<boolean>;
  /** Captures from another device. Rejects for a screen share, which has none. */
  setDevice(deviceId: string): Promise<void>;
}

export interface LocalAudioMediaTrack
  extends AudioMediaTrack, LocalMediaTrack {}

export interface LocalVideoMediaTrack extends VideoMediaTrack, LocalMediaTrack {
  /** For mirroring; undefined where the camera does not say which way it faces. */
  facingMode$: Behavior<"user" | "environment" | undefined>;
  /** Restarts the camera facing the other way; resolves with the device now in use. */
  switchFacingMode(): Promise<string | undefined>;
  /** Background blur and the like; undefined removes the processor. */
  setProcessor(
    processor: TrackProcessor<Track.Kind.Video> | undefined,
  ): Promise<void>;
}

export type EncryptionError = "MissingKey" | "InvalidKey";

/**
 * The media of one member, backed by a LiveKit participant inside the SDK.
 * There is no identity field: the LiveKit identity is the member's `id`, and
 * the SDK does the matching before a MemberMedia exists.
 */
export interface MemberMedia {
  local: boolean;
  /**
   * One entry per published track, in publication order. An entry stays the
   * same object for as long as the same publication is behind it. Which
   * track is which is in its `source`; `trackBySource$` picks one out.
   */
  tracks$: Behavior<(AudioMediaTrack | VideoMediaTrack)[]>;
  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

/** The member's first track of a source; undefined while there is none. */
export function trackBySource$<S extends MediaSource>(
  scope: ObservableScope,
  tracks$: Behavior<MediaTrack[]>,
  source: S,
): Behavior<TrackOfSource<S> | undefined>;

export interface LocalMemberMedia extends MemberMedia {
  local: true;
  tracks$: Behavior<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]>;
}
```

### Rendering: `attach` and `detach`

The view passes its DOM element into the SDK and the SDK does the rest; there is no
`MediaStreamTrack` on the interface. The reason is adaptive stream: Element Call
runs with `adaptiveStream: true`, which means LiveKit decides the simulcast layer
from the size of the attached video element and pauses the subscription at the
SFU while no attached element is on screen. Those size and visibility observers are
set up inside LiveKit's `attach`. Handing the element over is the only way to keep
that without reimplementing the observers outside the SDK. The e2e tests check both
effects: a larger tile receives a higher resolution, a hidden tile stops receiving
frames.

What `attach` covers for free, so the host does not have to: `srcObject` and
`autoplay` setup with the Safari and Firefox black-video workarounds; `play()` and
the autoplay-blocked signal; following the track through mute, reconnect and
re-subscription into every attached element; the Web Audio graph for earpiece pan
and gain; the adaptive stream observers.

The interface is web-only. A non-DOM host would need a different media surface; if
one shows up, a `MediaStreamTrack` accessor is added next to `attach`, not instead
of it.

## Packaging

`sdk/` is packaged exactly as `component/` is: a `package.json` with peer
dependencies (`matrix-js-sdk`, `livekit-client`, `rxjs`), `exports` with types,
type emission through `sdk/tsconfig.build.json`, an externals list in
`vite-sdk.config.ts` that `pnpm lint:externals` enforces, and installation from the
repository as a git dependency with a `path:` suffix. `pnpm build:sdk` produces
`sdk/dist`. It is not a pnpm workspace package yet; the root is not a workspace, and
moving to one later carries the package name, entry point and externals over
unchanged.

Element Call consumes the SDK by its package name from day one, so the swap to a
published dependency is one line: `tsconfig.json` `paths` and the `resolve.alias`
in `vitePluginsConfig` both map `@element-hq/matrixrtc-sdk` to `sdk/index.ts`. The
alias has to live in `vitePluginsConfig`, which every config is built on. Put only
into the app's own config, the harness resolves the name through `sdk/package.json`
to whatever stale `sdk/dist` is lying around.

Layout:

```
sdk/
  index.ts            the entry point: re-exports the API and the primitives
  src/api.ts          the public types above
  src/errors.ts       MatrixRTCError and its codes
  src/config.ts       MatrixRTCMode, session timings, media quality
  src/encryption.ts   E2eeType, EncryptionSystem
  src/reactive/       Behavior, ObservableScope, the observable operators
  src/session/        MatrixRTCClient, the local member, publisher, connections,
                      memberships, transports, discovery, JWT, join
  src/media/          the LiveKit adapter: MemberMedia and MediaTrack
  src/utils/          LazyBehavior, mapScoped, network retry, display names, test helpers
  dev/                the harness (below)
  SdkArchitecture.md  this document
  SdkMigration.md     how Element Call gets from CallViewModel to the client
```

The lint rule `element-call/sdk-import-boundary` keeps it that way: nothing under
`sdk/` may import a file outside `sdk/` (that is `src/`, `component/`,
`playwright/`) or React, i18n or Compound. The harness under `sdk/dev/` is a host
and exempt.

## Dev harness: `sdk/dev/`

A web app that uses the SDK and nothing else: plain DOM, no React, no Compound, no
i18n, imports only `@element-hq/matrixrtc-sdk`, `matrix-js-sdk` and `rxjs`. It is
where the SDK is run during development and what the e2e tests in `playwright/sdk`
drive. If something cannot be done in the harness without reaching into `src/`, the
SDK API is missing something.

What it does: log in with a password, or with an access token the URL hands it (the
tests register users through the admin API and skip `/login`, which the dev
homeserver rate-limits); join the room and wait for the sync to hold it; create the
client with microphone and camera enabled; show one tile per member with the display
name, a `<video>` attached from the member's `"camera"` track and, for remote
members, an `<audio>` from the `"microphone"` track, both picked out of
`media$.tracks$` with `trackBySource$`; toggle the microphone and camera; leave.

Every media element carries the track's state as `data-*` attributes (`muted`,
`encrypted`, `active`, `frameWidth`, `frames`), which is what the tests read to
check mute propagation, encryption, speaker detection, adaptive resolution and
paused subscriptions. That is more
than the smallest consumer needs, and the price of testing the SDK through its
public API only.

## Open decisions

- **Publishing before `join()`.** The initial requests are published at the
  join; creating the tracks earlier, for a lobby preview, is still missing.
- **`applicationData` after the join.** The option is read once; there is no
  way to update it on a live membership yet.
- **Raw local state.** The local member's state machine (`LocalMemberState`) stays
  internal; `status$`, `disconnectReason$` and `fatalError$` are its public view.
  A developer panel may want it as `LocalRTCMember.state$`.
- **Developer panel.** `resolved$` on each connected transport covers what the
  panel shows today. Anything beyond that (LiveKit room state, connection
  quality) needs an opaque `debug$` per transport.
- **Data beside the media.** `sendData`/`data$` ride on LiveKit's reliable data
  packets: topic-agnostic, matched to members by identity, received on every
  connection but sent only on the local transport, so a member on another
  transport does not hear us. They are transport-encrypted, not end to end:
  LiveKit can encrypt data packets with the media key, but that is not wired
  through the key provider yet. A host that needs either reach or end-to-end
  encryption uses room events.
- **Unencrypted rooms with per-participant keys.** Keys only reach devices the
  crypto tracks, which are the members of encrypted rooms. If the SDK is to work
  in an unencrypted room, tracking the members' devices becomes its job.
