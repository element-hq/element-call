# `MemberMedia`: a list of tracks instead of a call's four slots

`MemberMedia` in `sdk/src/api.ts` is written in the vocabulary of a video call. It
has four named slots, `microphone$`, `camera$`, `screenShare$` and
`screenShareAudio$`, and two member-level flags, `speaking$` and
`screenShareEnabled$`. A MatrixRTC session is not always a call: a whiteboard that
streams one video track, a translation bot with two audio tracks, a member
publishing two cameras, or a future application the SDK has not heard of all have
media, and none of it fits the four slots. The flags are worse than the slots.
`screenShareEnabled$` says only that the `screenShare$` slot is filled, and
`speaking$` names the microphone's activity after what people do with it in a call.

This plan replaces the slots and the flags with one `tracks$` list, and moves the
activity signal to where it is measured: `isActive$` on the audio track. The public
API changes; behaviour does not; the `playwright/sdk` specs and the dev harness
verify it.

The SDK's consumers of these fields today are the dev harness (`sdk/dev/main.ts`)
and, through it, the specs. Element Call's media view models on this branch still
read the LiveKit participant directly, so nothing under `src/` changes. This is the
cheapest moment to make the change: once Element Call consumes `MemberMedia`, every
view model in `src/state/media/` will be a call site.

> Note for the status table of [`SdkMigration.md`](./SdkMigration.md): it records
> slice 4 (view models take `media$`) as done, but on this branch
> `src/state/media/*.ts` still imports `livekit-client` and `CallViewModel.ts`
> does not import the SDK. Either the table is ahead of this branch or the slice
> lives elsewhere; the table should say which before this plan is added to it.

## What the tracks already know

The four slot getters were one line each: `participant.getTrackPublication(
livekitSources[source])`. That is a lookup by `source` in the participant's
`trackPublications` map. Everything the slot name told the consumer, the track
already carries:

| On the LiveKit publication | On `MediaTrack` today  | Set by                                                                  |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `source: Track.Source`     | `source: MediaSource`  | the publisher, at publish time; the SFU forwards it to every subscriber |
| `kind: Track.Kind`         | `kind`                 | the media stream track                                                  |
| `trackSid`                 | `id`                   | the SFU, stable for the life of the publication                         |
| `trackName`                | not exposed            | the publisher; free-form, empty for everything Element Call publishes   |
| `mimeType`, `dimensions`   | not exposed            | the SFU; `stats$` carries the live values, these are what was announced |
| `isMuted`, `isEncrypted`   | `muted$`, `encrypted$` | the publisher and the SFU                                               |

So a flat list is lossless: `tracks$.find((t) => t.source === "camera")` is exactly
what `camera$` returned, and `tracks$.some((t) => t.source === "screenShare")` is
exactly `screenShareEnabled$`, since LiveKit's `isScreenShareEnabled` is defined as
`!!getTrackPublication(Track.Source.ScreenShare)`, presence and not mute state.

One thing the slots lost that the list keeps: a publication with
`Track.Source.Unknown` never appeared in any slot. The list includes it, so
`MediaSource` grows a fifth value, `"unknown"`. A consumer that wants the call
vocabulary filters for the four names it knows; nothing is dropped on the way.

What the list does not try to do: the `trackName` and any application-specific
meaning stay out of the interface for now. Whether a non-call application tags
its tracks through the name, through the membership's `applicationData`, or
through a MatrixRTC-level description is a question for when such an application
exists; see "Other possible call-related refactors".

## The interface

```ts
export type MediaSource =
  | "microphone"
  | "camera"
  | "screenShare"
  | "screenShareAudio"
  /** Published without a source; the application knows what it is. */
  | "unknown";

export interface AudioMediaTrack extends MediaTrack {
  kind: "audio";
  /**
   * Whether the track carries sound right now, as the backend measures it.
   * False while muted. A call reads this on the microphone track and calls
   * it "speaking".
   */
  isActive$: Behavior<boolean>;
  setAudioContext(ctx: AudioContext | undefined, plugins?: AudioNode[]): void;
  setVolume(volume: number): void;
}

/**
 * The media of one member. One entry per published track, in publication
 * order; an entry is the same object for as long as the same publication is
 * behind it. There is no identity field: the backend identity is the member's
 * `id`.
 */
export interface MemberMedia {
  local: boolean;
  tracks$: Behavior<(AudioMediaTrack | VideoMediaTrack)[]>;
  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

export interface LocalMemberMedia extends MemberMedia {
  local: true;
  switchCamera(): Promise<string | undefined>;
}
```

Removed: `speaking$`, `screenShareEnabled$`, `microphone$`, `camera$`,
`screenShare$`, `screenShareAudio$`. `switchCamera` stays in this plan because it
is a different question (see the refactors section).

### One helper, exported

Every consumer will want "the member's track for a source, as a behavior". The
harness needs it twice already, and Element Call will need it in every media view
model. Rather than let each caller write the `map` + `distinctUntilChanged` chain,
the SDK exports one function from `sdk/src/utils/tracks.ts`:

```ts
/** The first track of a source, undefined while there is none. */
export function trackBySource$<S extends MediaSource>(
  scope: ObservableScope,
  tracks$: Behavior<MediaTrack[]>,
  source: S,
): Behavior<TrackOfSource<S> | undefined>;
```

`TrackOfSource` narrows `"microphone" | "screenShareAudio"` to `AudioMediaTrack`
and `"camera" | "screenShare"` to `VideoMediaTrack`, so the typed getters the slots
gave are not lost. It is a pure function over `Behavior`s, tested with marbles.
Nothing else is added; `some`, `filter` and `find` on the array cover the rest.

## `isActive$`: how it replaces `speaking$`

### What LiveKit measures

The SFU runs speaker detection from the audio-level RTP header extension on the
audio it forwards, and pushes `SpeakerInfo { sid, level, active }` updates to every
client. `livekit-client` turns them into `participant.audioLevel`,
`participant.isSpeaking` and `ParticipantEvent.IsSpeakingChanged` (see
`Room.handleActiveSpeakersUpdate` and `handleSpeakersChanged`). The `sid` is the
participant's; there is no per-track speaking signal in the client API. `speaking$`
today is `IsSpeakingChanged` mapped to `isSpeaking`, nothing more.

### What the SDK exposes

`isActive$` on an audio track is the participant's speaking signal gated by the
track's own mute state:

```
isActive = participant.isSpeaking && !publication.isMuted
```

For the LiveKit backend this maps one participant-level signal onto every audio
track of the member. In practice a member has one audio track, the microphone, and
the mapping is exact. A member that also shares a screen with audio gets the same
value on both tracks while either carries sound; the mute gate keeps a muted
microphone dark while the screen share plays. This is a documented approximation of
the LiveKit adapter, not of the interface: a full-mesh backend has a peer connection
per remote member and measures each track's level itself, and a stats-based
refinement exists for LiveKit too (below). The track is the right place for the
behavior because that is where every backend other than a single SFU would produce
it.

### Why a call loses nothing

"Speaking" is a call's reading of "the member's microphone track is active". The
replacement for `media.speaking$` is:

```ts
trackBySource$(scope, media.tracks$, "microphone").pipe(
  switchMap((track) => track?.isActive$ ?? of(false)),
);
```

False when there is no microphone track, which is what `isSpeaking` reported in
that case too. Element Call's 1 s / 60 s hysteresis (`observeSpeaker$`) and the
spotlight speaker selection stay in the call view model, where they are: they are
call UX, and they consume a boolean exactly as before.

What is gained: screen share audio can show activity ("the presenter's video has
sound"), and an application with several audio tracks per member can tell them
apart once the backend can. What is lost: nothing the SFU knew. The signal was
never per track in LiveKit; the interface now says so instead of pretending the
member speaks.

### Later refinement, not in this plan

A genuinely per-track level for LiveKit is available from the RTP statistics the
SDK already polls for `stats$`: `audioLevel` and `totalAudioEnergy` on
`RTCInboundRtpStreamStats`, and on the `media-source` stats for a local track. The
poll is once a second, which the call's hysteresis tolerates but which is too
coarse for an unfiltered indicator, and it costs a stats request per audio track
per second while subscribed. If a second audio track per member ever matters, that
is the first thing to try.

## What changes, file by file

### `sdk/src/api.ts`

The interface above. The comment on `MemberMedia` says the list is in publication
order and that entries are stable per publication; the comment on `isActive$` says
what it measures and names the LiveKit approximation.

### `sdk/src/media/LivekitMediaTrack.ts`

- `createLivekitMediaTrack` stops taking `source` as a parameter and derives it
  from `publication.source` through the inverse of `livekitSources`, with
  `Track.Source.Unknown` as `"unknown"`.
- Audio tracks get `isActive$`: `observeParticipantEvents(participant,
ParticipantEvent.IsSpeakingChanged)` mapped to `isSpeaking`, combined with
  `muted$`, as a `scope.behavior` seeded from `participant.isSpeaking &&
!publication.isMuted`.
- `setVolume` acts on the track instead of the source. Today it branches on
  `source` and calls `RemoteParticipant.setVolume(volume, Track.Source.X)`, which
  has nothing to do for an `"unknown"` audio track. `RemoteAudioTrack.setVolume`
  exists and is per track; the local no-op stays. `track$` is already a behavior
  here, so the volume is reapplied when a remote track arrives on subscription, the
  same way the audio context is.

### `sdk/src/media/LivekitMemberMedia.ts`

- `speaking$`, `screenShareEnabled$` and the four `track$` calls go; `memberTrack$`
  goes with them.
- `tracks$` is built from `observeParticipantMedia(participant)` (it already fires
  on publish, unpublish, subscribe and mute) mapped to
  `[...participant.trackPublications.values()]`, then through `generateItems` from
  `reactive/observable.ts`, keyed by `trackSid`, so each publication gets one
  `createLivekitMediaTrack` in a scope that ends when the publication leaves the
  map. This is the pattern `MatrixRTCClient.ts` uses for `remoteMembers$`; nothing
  new is written for it.
- Publication order is the map's insertion order, which `generateItems` preserves.

### `sdk/src/utils/tracks.ts`

`trackBySource$` as above, exported from `sdk/index.ts`.

### `sdk/dev/main.ts`

`memberTile` renders from `trackBySource$(scope, tracks$, "camera")` and
`"microphone"`, where `tracks$` is `media$` switched to `media?.tracks$ ?? of([])`.
`render` adds one label, `data-active`, from `isActive$` when the track is audio.
The `member`, `video` and `audio` test ids do not change, so the existing specs
keep passing untouched.

### Documentation

- `SdkArchitecture.md`: the `MemberMedia` block in "Media: `MemberMedia`", the
  diagram line that lists `speaking$ microphone$ camera$ screenShare$`, and the
  harness description that mentions `media$.camera$` and `media$.microphone$`.
- `SdkMigration.md`: a new row in the status table once the branch question above
  is settled.
- `MediaBackendPlan.md`: no change; it already treats `media/` as the clean seam and
  this plan only makes that seam less call-shaped.

## Tests

### Unit

- `LivekitMediaTrack.test.ts`, existing file: `isActive$` follows
  `IsSpeakingChanged`; a muted publication reports `false` while the participant
  speaks; `source` is derived from the publication, including `"unknown"`;
  `setVolume` reaches the remote track, and again when a track arrives later.
- `LivekitMemberMedia.test.ts`, new: `tracks$` lists every publication in order;
  the same object is returned for a publication across unrelated media events (a
  mute on another track); a publication replaced under the same source yields a new
  object and ends the old one's scope; an unknown-source publication appears with
  `source: "unknown"`; screen share presence is derivable with `some`.
- `tracks.test.ts`, new: `trackBySource$` with marbles, including the transition
  from undefined to a track and back.

The fakes come from `sdk/src/utils/test.ts` (`mockRemoteParticipant`) and the
`fakes()` helper already in `LivekitMediaTrack.test.ts`; the latter moves to
`test.ts` if the new file needs it, rather than being copied.

### End-to-end

`playwright/sdk/media.spec.ts` gains one test: the peer's `audio` element reaches
`data-active="true"` after a mute and unmute, and `"false"` while muted. It is
marked `fixme`: Chromium's fake microphone never registers as a speaker at the
SFU, and Firefox's steady tone does so in about two runs out of three, with or
without the browser's audio processing. It passed four times in six, which proves
the pipeline, and it stays out of the gate until the dev SFU gets a lower
speaker threshold or the harness a louder fake device. The existing five tests
run as they are.

## Order of work

1. `api.ts`, `tracks.ts` and the unit tests for `trackBySource$`.
2. `LivekitMediaTrack.ts`: source from the publication, `isActive$`, per-track
   volume, with its tests.
3. `LivekitMemberMedia.ts`: `tracks$`, remove the rest, with its new test file.
4. `dev/main.ts` and the new spec.
5. Documentation.

Steps 1 to 3 do not compile against the harness until step 4, so they land as one
PR; it is under 400 lines because the media adapter is small. `pnpm lint`,
`pnpm test` and the `playwright/sdk` project are the gates. `knip` will not
complain about `trackBySource$` since the harness uses it.

## Other possible call-related refactors

Everything else in `sdk/src/api.ts` and `sdk/src/session/` that only makes sense
for a call. None of it is in this plan; each would be its own slice. The first
three are the ones this plan makes visible.

| What                                                                                                                              | Why it is call-specific                                                                                                                                                       | What instead                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaSource` itself                                                                                                              | Four call names plus `"unknown"`. LiveKit's `Track.Source` has the same four, so the type is faithful to the wire today, but a whiteboard or a bot has no name for its track. | Keep `source` for the backend's notion; add an optional `name` (LiveKit `trackName`) or a description in `applicationData`, once an application needs it.                        |
| `LocalRTCMember.sharingScreen$`, `toggleScreenSharing`, `screenShareError$`, `dismissScreenShareError`                            | A screen share is one publication among others. `sharingScreen$` is `participant.isScreenShareEnabled`, now `tracks$.some(...)` on the local media.                           | A generic `publish(source, capture)` / `unpublish(id)` on the local member, with its error on the returned promise; `sharingScreen$` derived by the host from `tracks$`.         |
| `LocalMemberMedia.switchCamera`                                                                                                   | "Camera" is the call's name for the local video track with a `facingMode$`.                                                                                                   | `switchFacingMode()` on the local `VideoMediaTrack`, next to `facingMode$`.                                                                                                      |
| `MatrixRTCClient.setMicrophoneEnabled` / `setCameraEnabled`                                                                       | Two fixed publications the client knows by name.                                                                                                                              | `setEnabled(enabled)` on the local track, or `publish`/`unpublish`; `LocalMember.setEnabled` and `Publisher.setEnabled` already take a `Track.Source` and would take a track id. |
| `LocalMediaInputs` (`microphoneEnabled`, `cameraEnabled`, `audioInputDeviceId$`, `videoInputDeviceId$`, `videoProcessor$`)        | Describes exactly one microphone and one camera. `audioOutputDeviceId$` is about playback and is not call-specific.                                                           | A list of desired local publications, each with its device, processor and enabled state; `Publisher.desired.microphone$` / `camera$` become entries in it.                       |
| `CaptureSettings { audio, camera, screenShare }` and `MediaQuality { video, screen_share }`                                       | Keyed by the four sources.                                                                                                                                                    | Per-publication capture and encoding options, passed with `publish`. `config.ts` keeps the host-facing `MediaQuality` shape for `config.json`, mapped at the edge.               |
| `AudioMediaTrack.setVolume` branching on source                                                                                   | Covered by this plan (per-track volume); listed so the row above it is complete.                                                                                              | Done here.                                                                                                                                                                       |
| `Track.Source` plumbing in `Publisher.ts` (`pauseUpstreams`, `resumeUpstreams`, the processor on the camera) and `LocalMember.ts` | Internal, but the three sources are enumerated by hand in five places.                                                                                                        | Iterate the local publications; attach the processor to every local video track whose publication asks for one.                                                                  |
| `applicationData` carrying only `m.call.intent`; `application` defaulting to `m.call`                                             | The js-sdk's membership format carries one key. The default is a convenience for the one application that exists.                                                             | Pass the record through once the js-sdk can; keep the default but say so in the SDK README. Already an open item in `SdkArchitecture.md`.                                        |
| `membership$: Behavior<CallMembership>` on `RTCMember`                                                                            | The js-sdk's type name. The SDK does not get to rename it, but every host sees the word "call" in a session API.                                                              | Re-export under an SDK alias (`RTCMembership`) and narrow to what hosts read: `userId`, `deviceId`, `memberId`, `rtcBackendIdentity`, `getTransport()`, `applicationData`.       |
| `UnknownCallError` in `errors.ts`                                                                                                 | Name only.                                                                                                                                                                    | Rename with the two `Livekit*` errors in slice 11 of `SdkMigration.md`.                                                                                                          |
| `observeSharingScreen$` in `LocalMember.ts`                                                                                       | Reads `participant.isScreenShareEnabled`.                                                                                                                                     | Goes with `sharingScreen$`, or reads `tracks$` from the local media in the meantime.                                                                                             |
| `sendNotificationType`                                                                                                            | Kept on purpose; see "Call-specific things kept out of the client" in `SdkArchitecture.md`.                                                                                   | Nothing.                                                                                                                                                                         |

## Plan for the refactors above

Four slices, in dependency order. Each is one PR, green on its own, with the
`playwright/sdk` specs and the dev harness as the proof that behaviour is kept.
Element Call follows on its own branch after each.

### 1. Local track controls

The local member's tracks become objects a host can act on, instead of methods
named after a call's devices.

- **Add** `LocalAudioMediaTrack` and `LocalVideoMediaTrack` (`local: true`) in
  `api.ts`, with `setEnabled(enabled)`, `setDevice(deviceId)` and, on video,
  `switchFacingMode()` and `setProcessor(processor)`. `tracks$` on
  `LocalMemberMedia` is typed to them.
- **Remove** `LocalMemberMedia.switchCamera`, and `audioInputDeviceId$`,
  `videoInputDeviceId$`, `videoProcessor$` from `LocalMediaInputs`. The host
  subscribes to its settings and calls the track; the SDK stops watching
  behaviors it does not own. `audioOutputDeviceId$` stays: playback is not a
  track.
- **Keep** `setMicrophoneEnabled` / `setCameraEnabled` for now: they also cover
  "no track yet", which slice 2 solves.
- **Touches** `LivekitMediaTrack.ts`, `Publisher.ts` (the processor and device
  code moves onto the track), `MatrixRTCClient.ts`, the harness buttons.

### 2. `publish` and `unpublish`

One way to put media on the session, whatever it is.

- **Add** to `LocalRTCMember`: `publish(request): Promise<LocalMediaTrack>` and
  `unpublish(id): Promise<void>`. A request is `{ source, deviceId?, capture? }`
  for `"microphone"` and `"camera"`, `{ source: "screenShare", audio?, capture?
}` for a screen. Failures reject the promise with a `MatrixRTCError`.
- **Remove** `sharingScreen$`, `toggleScreenSharing`, `screenShareError$`,
  `dismissScreenShareError`, `observeSharingScreen$`, and the two
  `set*Enabled` methods on the client. "Sharing" is `tracks$.some(...)` on the
  local media; "enable" is `publish` or `track.setEnabled`.
- **Replace** `LocalMediaInputs.microphoneEnabled` / `cameraEnabled` with
  `publish: PublishRequest[]`, applied once the transport is up, as today.
  `CaptureSettings` becomes the `capture` of a request; `MediaQuality` keeps its
  `config.json` shape and is mapped to per-request capture at the edge.
- **Touches** `LocalMember.ts` (the screen share block and `setEnabled`),
  `Publisher.ts` (iterates requests instead of enumerating three sources),
  `livekitOptions.ts`, `lifecycle.spec.ts` and `media.spec.ts` for the new
  buttons.

### 3. Names that say "call"

No behaviour change; one PR of renames and type narrowing.

- `RTCMember.membership$` is typed as an SDK `RTCMembership`: the subset of
  `CallMembership` hosts read (`userId`, `deviceId`, `memberId`,
  `rtcBackendIdentity`, `getTransport()`, `applicationData`). The js-sdk object
  is still what is behind it.
- `UnknownCallError` is renamed with the two `Livekit*` errors, as slice 11 of
  `SdkMigration.md` already plans; `index.ts` drops its alias.
- `applicationData` is passed through whole once the js-sdk accepts more than
  `m.call.intent`; until then the README says which key survives.

### Not planned

- `MediaSource` keeps its five values. A `name` on `MediaTrack` (LiveKit's
  `trackName`) is a one-line addition when the first non-call application asks
  for it; adding it now would be a guess at that application's needs.
- `sendNotificationType` stays, as `SdkArchitecture.md` already decided.

## Changed behaviour

What a host sees differently, per slice. All four blocks are implemented.

### `tracks$` and `isActive$` (this plan, implemented)

| Before                                                                 | After                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `media.camera$`, `.microphone$`, `.screenShare$`, `.screenShareAudio$` | `trackBySource$(scope, media.tracks$, "camera")`, and so on          |
| `media.screenShareEnabled$`                                            | `media.tracks$` mapped to `some((t) => t.source === "screenShare")`  |
| `media.speaking$`                                                      | `isActive$` on the `"microphone"` track; `false` while there is none |
| `createLivekitMediaTrack(…, source)`                                   | the source is read from the publication (internal)                   |

Differences in what the values mean:

- **Tracks published without a source now appear**, with `source: "unknown"`.
  Before, they were invisible. A host that renders every track must be ready
  for a track it has no name for.
- **`isActive$` is `false` while the track is muted**, even if LiveKit still
  reports the member as speaking. `speaking$` was not gated by mute.
- **`isActive$` is the same on every audio track of a member**, because LiveKit
  detects speakers per participant. A member sharing a screen with audio lights
  both tracks while either carries sound.
- **`setVolume` applies to the track, not the source.** It is remembered and
  reapplied when the remote track arrives on subscription, so a volume set
  before the track exists is no longer lost. It still does nothing on our own
  tracks.
- **One `MediaTrack` object per publication**, stable across unrelated media
  events. Before, a slot's object also changed only with its publication, so
  nothing changes for the four known sources.
- **The list is in publication order** (the participant's map order). Nothing
  before had an order.
- The harness labels audio elements with `data-active`. Test ids are unchanged.

### Slice 1, local track controls

- `switchCamera()` on the local media becomes `switchFacingMode()` on the local
  camera track, so there is always a track to call it on; it still resolves
  `undefined` where the facing mode is unknown.
- Input device and processor changes are calls on the track. The SDK no longer
  reacts to `audioInputDeviceId$`, `videoInputDeviceId$` or `videoProcessor$`;
  a host that changed a setting and expected the SDK to follow now calls
  `setDevice` or `setProcessor` itself. The initial device and processor travel
  with the publish request instead.
- `setEnabled(false)` on a local track mutes it and keeps the publication, as
  `setMicrophoneEnabled(false)` does today.

### Slice 2, `publish` and `unpublish`

- Screen sharing is `publish({ source: "screenShare" })` and `unpublish(id)`.
  A capture failure rejects the promise; there is no `screenShareError$` to
  dismiss.
- "Am I sharing" is derived from `tracks$` by the host. The SDK no longer
  exposes `sharingScreen$`.
- `setMicrophoneEnabled` / `setCameraEnabled` are gone. Before the transport
  is connected, `publish` is remembered and applied once it is, which is what
  the two methods did.
- The initial microphone and camera are `LocalMediaInputs.publish`, a list;
  an empty list joins without publishing, which needed `microphoneEnabled:
false, cameraEnabled: false` before.
- Capture settings travel with each request. A host that set
  `capture.screenShare` once sets it on each screen share publish instead.

### Slice 3, names

- `membership$` is typed as `RTCMembership`. A host that reached for a
  `CallMembership` member outside the narrowed set must import the js-sdk type
  itself; the object is unchanged.
- `UnknownCallError` is `UnknownRTCError` in the SDK too, not only in the
  export. Error codes do not change. The two `Livekit*` errors are left to
  slice 11 of `SdkMigration.md`, which renames them on both sides at once.
- `applicationData` is forwarded whole: the js-sdk takes it next to
  `m.call.intent`, which the membership format carries as a field of its own.
