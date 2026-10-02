# From `CallViewModel` to `MatrixRTCClient`

How Element Call gets from today's `CallViewModel`, which does everything, to a
view model that consumes the SDK. The target shape is in
[`SdkArchitecture.md`](./SdkArchitecture.md); this document is the inventory of
what moves, what stays, and how far along it is. It refers to source files and
symbols, so it ages with the code; the architecture document should not.

## Status

| Slice                                                                                                                                                                                                 | State                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1. Scaffold: `sdk/` packaging, the interface, the harness, the smoke test                                                                                                                             | done, October 2026   |
| 2. First implementation of `createMatrixRTCClient` under `sdk/src`, the media adapter, the e2e suite                                                                                                  | done, 1 October 2026 |
| 3. Copy the shared modules into `sdk/src/` with their tests, drop every `src/` import, turn on the import boundary                                                                                    | done, 2 October 2026 |
| 4. `createCallViewModel$` consumes the client; media view models take `media$`; Element Call imports the primitives and enums from the SDK and deletes its own copies; the old demo target is removed | done, 2 October 2026 |

Element Call now consumes the SDK. `InCallView` creates the client from the
configuration, settings and URL parameters, and hands it to `createCallViewModel$`,
which keeps what makes the session a call. The modules below were deleted from
`src/` once the SDK had its copies, and `Behavior`, `ObservableScope`, the
observable operators, `E2eeType`, `EncryptionSystem` and `MatrixRTCMode` are
re-exported from the SDK by their old paths so the rest of Element Call did not
have to change in the same step. The view model tests drive a fake
`MatrixRTCClient` (`mockMatrixRTCClient` in `src/utils/test.ts`) instead of mocked
LiveKit rooms; the tests of the deleted modules live on in `sdk/src`.

## What was copied from `src/`, and what changed on the way

All of these are gone from `src/` as of slice 4; the table records where they went.

Each module came with its tests (`sdk/src/utils/test.ts` and `test-fixtures.ts` are
the subset of `src/utils/test.ts` and `test-fixtures.ts` they need). In slice 4
Element Call switches to the SDK's copy and deletes its own.

| In `src/`                                                                           | In `sdk/src/`                                             | What changed                                                                                                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `state/Behavior.ts`, `state/ObservableScope.ts`, `utils/observable.ts`              | `reactive/`                                               | as is                                                                                                                            |
| `state/SessionBehaviors.ts`                                                         | `session/SessionBehaviors.ts`                             | as is                                                                                                                            |
| `state/CallViewModel/remoteMembers/Connection.ts`                                   | `session/Connection.ts`                                   | throws `MatrixRTCError`s; the SDK still subclasses it as `ResolvedConnection` to keep the JWT answer, to be folded in            |
| `state/CallViewModel/remoteMembers/ConnectionFactory.ts`                            | `session/ConnectionFactory.ts`                            | the interface only; `ECConnectionFactory` reads settings and `MediaDevices`, the SDK has `LivekitConnectionFactory`              |
| `state/CallViewModel/remoteMembers/ConnectionManager.ts`                            | `session/ConnectionManager.ts`                            | as is                                                                                                                            |
| `state/CallViewModel/remoteMembers/MatrixLivekitMembers.ts`                         | `session/MatrixLivekitMembers.ts`                         | as is; the SDK maps its result to `RTCMember`, `TaggedParticipant` is internal                                                   |
| `state/CallViewModel/remoteMembers/MatrixMemberMetadata.ts`, `utils/displayname.ts` | `session/MatrixMemberMetadata.ts`, `utils/displayname.ts` | as is                                                                                                                            |
| `state/CallViewModel/localMember/HomeserverConnected.ts`                            | `session/HomeserverConnected.ts`                          | the grace period defaults to `defaultSessionTimings` instead of `Config.get()`                                                   |
| `state/CallViewModel/localMember/LocalTransport.ts`                                 | `session/LocalTransport.ts`                               | the type and `isLocalTransport`; discovery without the custom-url setting                                                        |
| `state/CallViewModel/localMember/RtcTransportAutoDiscovery.ts`                      | `session/RtcTransportAutoDiscovery.ts`                    | takes `fallbackTransportUrl` instead of a resolved config                                                                        |
| `state/CallViewModel/localMember/LocalMember.ts`                                    | `session/LocalMember.ts`                                  | rewritten; only `observeSharingScreen$` was copied                                                                               |
| `livekit/openIDSFU.ts`                                                              | `session/openIDSFU.ts`                                    | the delegated leave timeout is a parameter (`delayTimeoutMs`) instead of `Config.get()`                                          |
| `livekit/options.ts`                                                                | `session/livekitOptions.ts`                               | `buildLiveKitOptions(mediaQuality?)` only; `getLiveKitOptions` and the `Config` singleton are gone                               |
| `e2ee/matrixKeyProvider.ts`                                                         | `session/MatrixKeyProvider.ts`                            | as is                                                                                                                            |
| `e2ee/e2eeType.ts`, the `EncryptionSystem` type from `e2ee/sharedKeyManagement.ts`  | `encryption.ts`                                           | the React hooks stayed behind                                                                                                    |
| `MatrixRTCMode`, the timings and media quality types from `config/ConfigOptions.ts` | `config.ts`                                               | `defaultSessionTimings` and `defaultMediaQuality` replace `DEFAULT_CONFIG`                                                       |
| `utils/errors.ts`                                                                   | `errors.ts`                                               | `MatrixRTCError` with `code` and `category` replaces `ElementCallError`; messages are plain English, the host translates by code |
| `doNetworkOperationWithRetry` from `utils/matrix.ts`                                | `utils/network.ts`                                        | as is                                                                                                                            |

Rewritten in the SDK rather than copied, because the originals read settings,
config, analytics or the host bridge: the local member (`session/LocalMember.ts`),
the publisher (`session/Publisher.ts`), the connection factory and LiveKit room
options (`session/ConnectionFactory.ts`), transport discovery
(`session/LocalTransport.ts`), the join (`session/joinJsSdkSession.ts`) and the
key provider selection (`session/KeyProvider.ts`).

## What becomes what in `createCallViewModel$`

Everything below `createCallViewModel$` that is not presentation and not in the
call-specific table of the architecture document. Grouped by what it is today in
`src/state/CallViewModel/CallViewModel.ts`.

| Binding today                                                                                  | In the SDK                                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `livekitKeyProvider` via `getE2eeKeyProvider`                                                  | internal, keyed off `options.encryptionSystem`                                                           |
| `matrixRTCMode` resolution from `Config.get()`                                                 | an input; resolution stays in the caller                                                                 |
| `matrixRTCSession` parameter                                                                   | internal: the session manager for the slot, `getRoomSession(room)`                                       |
| `memberships$`, `membershipsAndTransports`                                                     | internal; surfaces as `RTCMember.transport$`                                                             |
| `ownMembershipIdentity`                                                                        | internal; surfaces as `RTCMember.id`                                                                     |
| `localTransport$` via `getLocalTransport`                                                      | internal                                                                                                 |
| `connectionFactory`, `connectionManager`                                                       | internal; surfaces as `connectedTransports$`                                                             |
| `remoteMatrixLivekitMembers$`                                                                  | `remoteMembers$`                                                                                         |
| `localMembership` via `createLocalMembership$`, `enterRTCSession`, `Publisher`, `delayId$`     | internal; surfaces as `join`, `leave`, `status$`, `connected$`, `reconnecting$`, the screen share fields |
| `localRtcMembership$`, `localMatrixLivekitMember$`                                             | `localMember$`                                                                                           |
| `matrixLivekitMembers$`, `participantCount$`                                                   | `memberCount$`                                                                                           |
| `matrixRoomMembers$`, `matrixMemberMetadataStore`                                              | `RTCMember.displayName$` / `avatarUrl$`                                                                  |
| `allConnections$`                                                                              | `connectedTransports$`                                                                                   |
| `livekitRoomItems$`                                                                            | dropped; audio renders from `remoteMembers$[].media$`                                                    |
| `keyRotationSuppressed$`                                                                       | same                                                                                                     |
| `sharingScreen$`, `toggleScreenSharing`                                                        | `localMember$.sharingScreen$`, `.toggleScreenSharing`                                                    |
| `errors$` and the `fatalError$` mapping                                                        | `fatalError$`, as `MatrixRTCError`                                                                       |
| `join`, `leave`, `connected$`, `reconnecting$`, `screenShareError$`, `dismissScreenShareError` | same names on `MatrixRTCClient` / `LocalRTCMember`                                                       |
| `callIntent` option, `updateCallIntent` from the camera                                        | `applicationData["m.call.intent"]`; the camera sync is still in the SDK, see the open decisions          |

Changes to the call sites that the rename brings: `localMember$` and
`remoteMembers$` replace `localMatrixLivekitMember$` and
`remoteMatrixLivekitMembers$`; `connection$` on a member goes away, since the view
model only ever used `livekitRoom` (for `waitingForMedia$` and encryption errors,
both on `MemberMedia` now) and `transport.livekit_service_url` (now
`transport$.id`); `connectedTransports$` replaces `allConnections$`, since the
developer panel only needed which transports exist and whether they are up.

## What stays in `CallViewModel`

Everything in the call-specific table, plus everything that takes `userMedia$` or a
UI input and turns it into something to draw:

- Media view models (`createWrappedUserMedia` and below), built from
  `remoteMembers$` / `localMember$` instead of participants.
- `CallNotificationLifecycle.ts` in full: `ringAttempts$`, `autoLeave$`,
  `ringingMedia$`, `ringingStatusLocation`.
- `leave$` (= `autoLeave$` + `hangup()` + `hostBridge.hangUp$`), `hangup()`.
- `screenShares$`.
- Sounds: `joinSoundEffect$`, `leaveSoundEffect$`, `newHandRaised$`,
  `newScreenShare$`, `audibleReactions$`, `visibleReactions$`.
- `handsRaised$`, `reactions$`, until they move onto `RTCMember`.
- All layout: `spotlightSpeaker$`, `grid$`, `spotlight$`, `pip*`, `windowMode$`,
  `layoutSwitchVm`, every `*LayoutMedia$`, `layout$`, `visibleTiles$`,
  `tileStoreGeneration$`, `overflowing$`, `spotlightExpanded$`.
- Chrome: `showHeader$`, `showFooter$`, `edgeToEdge$`, `showModals$`,
  `settingsOpen$`, `showSpotlightIndicators$`, `showSpeakingIndicators$`,
  `showNameTags$`, tap and hover subjects.
- Audio routing: `earpieceMode$`, `audioOutputSwitcher$`, which read
  `MediaDevices`.
- `CallViewModelOptions` keeps `hostBridge`, `controlledAudioDevices`, `header`,
  `showControls`, `hideScreensharing`, `waitForCallPickup`,
  `autoLeaveWhenOthersLeft`, `windowSize$`, `toggleScreensharing` (test override),
  and forwards `encryptionSystem`, `matrixRTCMode`, `sendNotificationType` and
  `applicationData` to `MatrixRTCClientOptions`.

## The media view models and the participant

The goal of slice 4 on the media side: nothing in Element Call imports
`Participant`, `RemoteParticipant`, `LocalParticipant`, `TrackPublication`,
`Track` or `TrackReference`. This is where the participant flows today, and what
each use becomes.

### Where the participant flows today

Start: `remoteMatrixLivekitMembers$` in `CallViewModel.ts`, built by
`createRemoteMatrixLivekitMembers$` in
`src/state/CallViewModel/remoteMembers/MatrixLivekitMembers.ts`, as
`participant: { type: "remote"; value$: Behavior<RemoteParticipant | null> }`.
Consumers, in order of depth:

1. `MatrixLivekitMembers.ts` matches `participant.identity` against
   `membership.rtcBackendIdentity`; logs `participant.sid`.
2. `CallViewModel.ts` `livekitRoomItems$` reads `isLocal`, `identity`, hands
   `connection.livekitRoom` plus identities to `LivekitRoomAudioRenderer`.
3. `CallViewModel.ts` `userMedia$` passes the whole `TaggedParticipant` into
   `createWrappedUserMedia`.
4. `src/state/media/WrappedUserMediaViewModel.ts`: `observeParticipantEvents(p,
TrackPublished, TrackUnpublished, LocalTrackPublished, LocalTrackUnpublished)`
   then `p.isScreenShareEnabled` to spawn screen share view models.
5. `src/state/media/UserMediaViewModel.ts`: `observeParticipantMedia(p)` for
   `microphoneTrack?.isMuted` / `cameraTrack?.isMuted`; `IsSpeakingChanged` →
   `p.isSpeaking`; `observeRtpStreamStats$(p, source, type)`.
6. `src/state/media/MemberMediaViewModel.ts`: `observeTrackReference$(p, source)`
   for audio and video; `publication.isEncrypted`; `p.isLocal`; `p.identity`
   matched inside `RoomEvent.EncryptionError` messages; inbound RTP frame counters.
7. `src/state/media/RemoteUserMediaViewModel.ts`, `RemoteScreenShareViewModel.ts`:
   `p.setVolume(v)` / `p.setVolume(v, ScreenShareAudio)`; `participant === null`
   means "waiting for media".
8. `src/state/observeTrackReference.ts`: `p.getTrackPublication(source)` wrapped as
   `{ participant, publication, source }`.
9. `src/state/media/observeRtpStreamStats.ts`: `publication.track` must be
   `RemoteTrack | LocalTrack`, then `track.getRTCStatsReport()`.
10. Views: `src/tile/MediaView.tsx` renders `<VideoTrack trackRef={video}>` from
    `@livekit/components-react`; `src/livekit/MatrixAudioRenderer.tsx` uses
    `useTracks` on the LiveKit room, filters on `ref.participant.isLocal` /
    `.identity`, and calls `RemoteAudioTrack.setAudioContext` /
    `setWebAudioPlugins`.

Local-only extras, same shape but on `LocalParticipant`
(`localMember/LocalMember.ts`, `Publisher.ts`,
`src/state/media/LocalUserMediaViewModel.ts`): `trackPublications`,
`audioTrackPublications`, `setScreenShareEnabled`, `setMicrophoneEnabled`,
`setCameraEnabled`, `enableCameraAndMicrophone`, `isMicrophoneEnabled`,
`isCameraEnabled`, `unpublishTrack`, and on the camera `LocalVideoTrack`:
`facingModeFromLocalTrack`, `restartTrack`, `mediaStreamTrack`,
`TrackEvent.Restarted` / `Muted`.

### Participant API actually used, and what covers it

| LiveKit surface                                                                   | Used for                                                                            | Used in     | Now                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `identity`                                                                        | match to `rtcBackendIdentity`; audio renderer allow-list; E2EE error matching; logs | 1, 2, 6, 10 | matched inside the SDK; `RTCMember.id`           |
| `sid`                                                                             | logs only                                                                           | 1           | SDK logs                                         |
| `isLocal`                                                                         | skip local audio; encryption status short-circuit                                   | 2, 6, 10    | `MemberMedia.local`                              |
| `isSpeaking` + `IsSpeakingChanged`                                                | `speaking$`                                                                         | 5           | `MemberMedia.speaking$`                          |
| `isScreenShareEnabled` + publish events                                           | spawn screen share VM                                                               | 4           | `MemberMedia.screenShareEnabled$`                |
| `observeParticipantMedia(p)` → `microphoneTrack?.isMuted`, `cameraTrack?.isMuted` | `audioEnabled$`, `videoEnabled$`                                                    | 5           | `microphone$` / `camera$` → `muted$`             |
| `getTrackPublication(source)` for the four sources                                | `TrackReference` for video, encryption, stats, screen share audio presence          | 6, 7, 8     | the four track behaviors                         |
| `publication.isEncrypted`                                                         | `unencryptedWarning$`                                                               | 6           | `MediaTrack.encrypted$`                          |
| `publication.track.getRTCStatsReport()`                                           | `audioStreamStats$`, `videoStreamStats$`, "receiving okay" heuristic                | 5, 6, 9     | `MediaTrack.stats$`                              |
| `setVolume(v)`, `setVolume(v, ScreenShareAudio)`                                  | `VolumeControls` sink                                                               | 7           | `AudioMediaTrack.setVolume`                      |
| `TrackReference` → `<VideoTrack>`                                                 | render video                                                                        | 10          | `MediaTrack.attach` on a `<video>`               |
| room `useTracks` + `RemoteAudioTrack.setAudioContext/setWebAudioPlugins`          | render audio with earpiece pan/gain                                                 | 10          | one `<audio>` per audio track, `setAudioContext` |
| room `RoomEvent.EncryptionError` with `identity` + `"MissingKey"`/`"InvalidKey"`  | `encryptionStatus$`                                                                 | 6           | `MemberMedia.encryptionError$`                   |

Everything else in the media view models (`observeSpeaker$`, `VolumeControls`,
`SortingBin`, hand raise, reactions, display name, avatar, aspect ratio) already
works on plain booleans and observables and does not change.

### How the call sites map onto `MemberMedia`

- `audioEnabled$` = `microphone$ → track?.muted$ === false`; `videoEnabled$`
  likewise from `camera$`.
- `unencryptedWarning$` = any of the four tracks with `encrypted$ === false`.
- `encryptionStatus$` = `encryptionError$` plus a "frames decoded" check on
  `camera$.stats$` / `microphone$.stats$`; same logic, no participant.
- `screenShares$` in `WrappedUserMediaViewModel` keys off `screenShareEnabled$`.
- `VolumeControls` sink = `microphone$.value?.setVolume` /
  `screenShareAudio$.value?.setVolume`.
- `waitingForMedia$` = transport present and `media === null`, unchanged
  semantics; `TaggedParticipant` goes away.
- `video$: Behavior<TrackReference | undefined>` on `BaseMemberMediaViewModel`
  becomes `Behavior<VideoMediaTrack | undefined>`; `MediaView` replaces
  `<VideoTrack trackRef>` with a `<video>` plus `attach` / `detach` in an effect,
  keeping the `onResize` callback for the aspect ratio. `VideoPreview.tsx` already
  follows this pattern.
- `LivekitRoomAudioRenderer` stops using `useTracks` on the room and renders one
  `<audio>` per `microphone$` / `screenShareAudio$` across `remoteMembers$`. That
  removes the "no matching matrix call member" warning path, since an unmatched
  track can no longer be seen.
- The `showConnectionStats` setting gates the subscription to `stats$` in the view
  model; the SDK polls only while subscribed.
- Stories and tests mock `attach` by setting `srcObject` from
  `canvas.captureStream()` on the element, or by doing nothing and asserting the
  call.

## Packaging, as it was planned

`sdk/` mirrors `component/` file for file. The table that drove the scaffold, kept
for the record:

| `component/`                                                                         | `sdk/`                                                                  | Differences                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (`@element-hq/element-call-component`)                                | `package.json` (`@element-hq/matrixrtc-sdk`)                            | peers: `matrix-js-sdk`, `livekit-client`, `rxjs`. No React, no Compound. `exports`: `"."` only. No `./style.css`, no `sideEffects`. Same `prepare`. |
| `pnpm-workspace.yaml` (marker, `autoInstallPeers: false`)                            | same                                                                    | none                                                                                                                                                |
| `tsconfig.build.json`                                                                | same                                                                    | `include: ["./index.ts"]`                                                                                                                           |
| `index.tsx` + `api.ts`                                                               | `index.ts` + `src/api.ts`                                               | one entry; no separate types entry until a host asks                                                                                                |
| `host.ts`, `localization.ts`, `ElementCall.module.css`, `build/scopeStylesToRoot.ts` | none                                                                    | no host bridge, no i18n, no styles                                                                                                                  |
| `dev/` on port 3001                                                                  | `dev/` on port 3002 via `vite-sdk-dev.config.ts`                        | plain DOM                                                                                                                                           |
| `vite-component.config.ts`                                                           | `vite-sdk.config.ts`                                                    | `vitePluginsConfig({ mode, html: false })`, `outDir: "sdk/dist"`, externals = js-sdk and LiveKit entries plus `rxjs`                                |
| root scripts `build:component*`                                                      | `build:sdk*`                                                            | `build:sdk:types` = `tsc -p sdk/tsconfig.build.json`                                                                                                |
| root `tsconfig.json` `include`                                                       | adds `./sdk/**/*.ts`                                                    |                                                                                                                                                     |
| `scripts/check-component-externals.mjs`                                              | parameterised by config; `sdk` added to the sources, `sdk/dev` excluded |                                                                                                                                                     |
| `knip.ts`                                                                            | `vite-sdk.config.ts`, `vite-sdk-dev.config.ts`, `sdk/index.ts` as entry |                                                                                                                                                     |
| `vitest.config.ts` unit project                                                      | adds `sdk/**/*.test.ts`                                                 |                                                                                                                                                     |
| `package.json` `lint:oxlint` paths                                                   | adds `sdk`                                                              |                                                                                                                                                     |

Why not a pnpm workspace package yet: the root has no `packages:` in
`pnpm-workspace.yaml`, so a workspace split means restructuring the app, the
component's `prepare` trick, CI and the lockfile at the same time as moving the
code, and dev-time HMR across workspace packages needs the same source alias
anyway. It is the right end state if the SDK gets a release cadence of its own.

## Reference: the `CallViewModel` public API before the migration

Source: `src/state/CallViewModel/CallViewModel.ts`. Only consumer outside tests:
`src/room/InCallView.tsx`. A snapshot, so that the split can be checked against
what was there.

### Factory

`createCallViewModel$(scope, matrixRTCSession, matrixRoom, mediaDevices, muteStates, options, handsRaisedSubject$, reactionsSubject$, trackProcessorState$): CallViewModel`

- `scope: ObservableScope`: ending the scope is one of the two ways to leave.
- `matrixRTCSession: MatrixRTCSession`, `matrixRoom: MatrixRoom`: one room per view model.
- `mediaDevices: MediaDevices`, `muteStates: MuteStates`
- `options: CallViewModelOptions` (below)
- `handsRaisedSubject$: Observable<Record<string, RaisedHandInfo>>`
- `reactionsSubject$: Observable<Record<string, ReactionInfo>>`
- `trackProcessorState$: Behavior<ProcessorState>`

Helper: `callViewModelOptionsFromParams(params: UrlParams)` picks
`controlledAudioDevices`, `header`, `showControls`, `hideScreensharing`,
`sendNotificationType`, `callIntent` out of the URL params. `autoLeaveWhenOthersLeft`
and `waitForCallPickup` are left to the caller.

### `CallViewModelOptions`

| Field                                                                                                       | Type                        | Note                                                |
| ----------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| `encryptionSystem`                                                                                          | `EncryptionSystem`          | required                                            |
| `hostBridge?`                                                                                               | `HostBridge`                | host can hang up / observe join+leave; default none |
| `controlledAudioDevices?`                                                                                   | `boolean`                   | host controls audio output devices                  |
| `header?`                                                                                                   | `HeaderStyle`               | default `Standard`                                  |
| `showControls?`                                                                                             | `boolean`                   | default `true`                                      |
| `hideScreensharing?`                                                                                        | `boolean`                   | default `false`                                     |
| `sendNotificationType?`                                                                                     | `RTCNotificationType`       | notification sent on join                           |
| `callIntent?`                                                                                               | `RTCCallIntent`             |                                                     |
| `autoLeaveWhenOthersLeft?`                                                                                  | `boolean`                   |                                                     |
| `waitForCallPickup?`                                                                                        | `boolean`                   | telephone-style ringing UI                          |
| `windowSize$`                                                                                               | `Behavior<{width; height}>` | required; drives `WindowMode`                       |
| `matrixRTCMode?`                                                                                            | `MatrixRTCMode`             | MatrixRTC version / compat mode                     |
| `livekitRoomFactory?`, `connectionState$?`, `localTransport?`, `connectionFactory?`, `toggleScreensharing?` |                             | test overrides                                      |

### The interface, grouped

**Lifecycle / connection** (to the client): `join()`, `leave()`, `hangup()`,
`leave$: Observable<"user" | AutoLeaveReason>`, `autoLeave$`, `connected$`,
`reconnecting$`, `allConnections$: Behavior<ConnectionManagerData>`,
`fatalError$: Behavior<ElementCallError | null>`, `keyRotationSuppressed$`.

**Members / participants** (to the client): `participantCount$`,
`localMatrixLivekitMember$`, `remoteMatrixLivekitMembers$`, `livekitRoomItems$`,
`handsRaised$`, `reactions$` (keyed by `${userId}:${deviceId}`).

**Screen sharing** (capability to the client, error UI stays): `toggleScreenSharing`,
`sharingScreen$`, `screenShareError$`, `dismissScreenShareError()`.

**Ringing** (stays): `ringingVm$`, `ringingStatusLocation`.

**Audio routing** (stays): `earpieceMode$`, `audioOutputSwitcher$`.

**Sounds and transient events** (stay): `joinSoundEffect$`, `leaveSoundEffect$`,
`newHandRaised$`, `newScreenShare$`, `audibleReactions$`, `visibleReactions$`,
`MAX_PARTICIPANT_COUNT_FOR_SOUND = 8`, `THROTTLE_SOUND_EFFECT_MS = 500`.

**Layout and tiles** (stay): `layout$`, `tileStoreGeneration$`,
`showSpotlightIndicators$`, `showSpeakingIndicators$`, `showNameTags$`,
`spotlightExpanded$`, `toggleSpotlightExpanded$`, `layoutSwitchVm$`.

**Chrome visibility and UI interaction** (stay): `showHeader$`, `showFooter$`,
`edgeToEdge$`, `overflowing$`, `showModals$`, `settingsOpen$`, `setSettingsOpen$`,
`tapScreen()`, `tapControls()`, `hoverScreen()`, `unhoverScreen()`.

### Pending rename noted in the source

A TODO above `CallViewModelOptions` proposes: member/membership → `rtcMember`,
participant → `livekitParticipant`, matrixLivekitItem → `callMember`; and in the
js-sdk `callMembership` → `rtcMembership`. The SDK's vocabulary (architecture
document, "Vocabulary") settles the first three; the js-sdk rename is still open.

### Build targets before the migration

`vite-sdk.config.ts` (`pnpm build:sdk`), `vite-component.config.ts`,
`vite-embedded.config.ts`, `vite.config.ts`. The old SDK target
(`sdk-target-based-on-call-view-model/`) is the one whose dependency direction the
migration flips; it goes in slice 5.
