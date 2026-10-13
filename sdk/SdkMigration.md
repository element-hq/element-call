# What moved from `src/` into the SDK

Element Call's `CallViewModel` used to do everything; now it consumes the SDK and
keeps only what makes a session a call. This is the inventory of what moved out
of `src/` on the way, so that a reader of either side knows where to look. It
names source files, so it ages with the code; the shape they make is in
[`SdkArchitecture.md`](./SdkArchitecture.md).

Everything in the table is gone from `src/`. Each module came with its tests;
`sdk/src/utils/test.ts` and `test-fixtures.ts` are the subset of Element Call's
test helpers they need. `Behavior`, `ObservableScope`, the observable operators,
`E2eeType`, `EncryptionSystem` and `MatrixRTCMode` are re-exported from the SDK
by their old `src/` paths, so the rest of Element Call did not have to change.

| Was in `src/`                                                                       | Is in `sdk/src/`                                                                               | What changed on the way                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `state/Behavior.ts`, `state/ObservableScope.ts`, `utils/observable.ts`              | `reactive/`                                                                                    | as is                                                                                                                            |
| `state/SessionBehaviors.ts`                                                         | `matrixrtc/JsRtcSessionBehaviors.ts`                                                           | the memberships and key rotation behaviors only                                                                                  |
| `state/CallViewModel/localMember/HomeserverConnected.ts`                            | `matrixrtc/HomeserverConnected.ts`                                                             | the grace period defaults to `defaultSessionTimings` instead of `Config.get()`                                                   |
| `state/CallViewModel/localMember/LocalMember.ts`                                    | `matrixrtc/LocalMembership.ts`, `media-backend/livekit/LocalMedia.ts`, `participationState.ts` | split into the Matrix side, the media side and the state machine that combines them                                              |
| `state/CallViewModel/localMember/LocalTransport.ts`, `RtcTransportAutoDiscovery.ts` | `matrixrtc/LocalTransport.ts`, `TransportAutoDiscovery.ts`                                     | the override and the fallback are transports from the options, not a setting and a resolved config                               |
| `state/CallViewModel/remoteMembers/MatrixLivekitMembers.ts`                         | `media-backend/livekit/LivekitBackend.ts` (`mediaFor`)                                         | matches participants to members inside the backend; the SDK hands out `RTCMember`s                                               |
| `state/CallViewModel/remoteMembers/MatrixMemberMetadata.ts`, `utils/displayname.ts` | `matrixrtc/MatrixMemberMetadata.ts`, `utils/displayname.ts`                                    | as is                                                                                                                            |
| `state/CallViewModel/remoteMembers/Connection.ts`                                   | `media-backend/livekit/Connection.ts`                                                          | throws `MatrixRTCError`s; `ConnectionState` is a discriminated union; fetches its own token for its role                         |
| `state/CallViewModel/remoteMembers/ConnectionFactory.ts`                            | `media-backend/livekit/ConnectionFactory.ts`                                                   | `LivekitConnectionFactory` builds the room options from the publish requests and `mediaQuality`, not from settings               |
| `state/CallViewModel/remoteMembers/ConnectionManager.ts`                            | `media-backend/livekit/ConnectionMap.ts`                                                       | keyed by `TransportLocator`; the publisher role is the local transport's                                                         |
| `state/CallViewModel/localMember/Publisher.ts`                                      | `media-backend/livekit/Publisher.ts`                                                           | rewritten on publish requests instead of `MuteStates`                                                                            |
| `livekit/openIDSFU.ts`, later `livekit/auth/`                                       | `media-backend/livekit/auth/`                                                                  | the flow is chosen by the transport's shape and our role; the delegated leave timeout is a parameter                             |
| `livekit/options.ts`                                                                | `media-backend/livekit/livekitOptions.ts`                                                      | `buildLiveKitOptions(mediaQuality?)` only; the `Config` singleton is gone                                                        |
| `e2ee/matrixKeyProvider.ts`, the key provider selection                             | `media-backend/livekit/MatrixKeyProvider.ts`, `KeyProvider.ts`                                 | as is; selection keyed off `encryptionSystem`                                                                                    |
| `e2ee/e2eeType.ts`, `EncryptionSystem` from `e2ee/sharedKeyManagement.ts`           | `encryption.ts`                                                                                | the React hooks stayed behind                                                                                                    |
| `MatrixRTCMode`, the timings and media quality types from `config/ConfigOptions.ts` | `config.ts`                                                                                    | `defaultSessionTimings` and `defaultMediaQuality` replace `DEFAULT_CONFIG`                                                       |
| `utils/errors.ts`                                                                   | `errors.ts`                                                                                    | `MatrixRTCError` with `code` and `category` replaces `ElementCallError`; messages are plain English, the host translates by code |
| `doNetworkOperationWithRetry` from `utils/matrix.ts`                                | `utils/network.ts`                                                                             | takes a `shouldRetry` predicate                                                                                                  |
| the join in `CallViewModel.ts` (`enterRTCSession`)                                  | `matrixrtc/joinJsSdkSession.ts`                                                                | the timings and the delayed leave variant are parameters                                                                         |
| `livekit/MatrixAudioRenderer.tsx`, the participant reads in `state/media/`          | `media-backend/livekit/LivekitMediaTrack.ts`, `LivekitMemberMedia.ts`                          | the view models get `MediaTrack`s with `attach`; nothing in `src/` imports a LiveKit participant any more                        |

## What still binds Element Call to LiveKit

Each is a gap in the SDK's API rather than something to rename; the import goes
away when the SDK grows the piece. The names Element Call owes to the outside
stay as they are: the `livekit.livekit_service_url` key in `config.json`, the
persisted setting keys `extended-livekit-logs` and `custom-transport`, the
Posthog fields `callBackend` and `callReconnectingCountLivekit`, the rageshake
field `call_backend`, and the translated error strings.

| Gap                                                                                                         | Where it shows                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Preview before `join()`: local tracks for the lobby, handed out as `MediaTrack`s                            | `LobbyView` (`usePreviewTracks`), `VideoPreview` (`LocalVideoTrack`, `facingModeFromLocalTrack`) |
| Device enumeration without LiveKit's helpers                                                                | `MediaDevices` (`createMediaDeviceObserver`), `CallView` (`Room.getLocalDevices`)                |
| A `logging` option: log level and a sink for the transport's logs                                           | `initializer.tsx`, the `extended-livekit-logs` setting                                           |
| A `capabilities` field: output selection and background processors, asked of the SDK rather than of LiveKit | `CallFooterViewModel` (`supportsAudioOutputSelection`, `supportsBackgroundProcessors`)           |
| Element Call's error and analytics types on the SDK's                                                       | `PosthogEvents` (`DisconnectReason`), `errors.ts` (`ConnectionError`, `LivekitConnectionError`)  |
