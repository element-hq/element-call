# Element Call oxidation plan

Move Element Call's MatrixRTC participation logic off `matrix-js-sdk`'s
`MatrixRTCSession` and onto the Rust `matrix-rtc` crate
(`~/Projects/matrix-rust-rtc/MatrixSdkArchitectureDraft`), consumed through its
uniffi wasm bindings. The Element Call **component** then depends on one
host-supplied object, a `MatrixDriver`, and never on a `MatrixClient`. The
standalone app and the widget become hosts like any other: they build a
`MatrixDriver` from their `matrix-js-sdk` client and hand it to the component.

Revision 2 — incorporates the independent review (§10 lists what changed and
the assumptions taken where only the user can decide).

Status legend: ☐ todo · ◐ in progress · ☑ done.

**Where things stand (2026-09-14):** S0a, S0b, S1a, S1b and S2 are
implemented and green (`pnpm lint`, `pnpm format:check`, `pnpm test:unit`:
101 files / 785 tests). Nothing is committed yet, in either repository: the
crate changes C2–C12 (C1 reverted in favour of slot opening) are done; C2–C8,
C11 and C12 are committed in the draft repo as `a8e21b3`, C5 (final form), C9
and C10 are still uncommitted there. In Element Call everything sits
uncommitted in
`~/Projects/matrix-rust-rtc/MatrixSdkArchitectureDraft`, and Element Call's
branch `toger5/oxidation` holds the vendored bindings, the driver layer
(`src/driver/**`), the participation layer (`src/state/rtc/**`) and the
config/lint changes. S3a is the next slice; its design is in §6 and the
files it touches are listed there.

---

## 1. Goals and non-goals

**Goals**

1. `ElementCall` (component) takes `driver: MatrixDriver` instead of
   `client: MatrixClient`. Nothing rendered under `CallView` imports
   `MatrixClient`, `Room`, `RoomMember`, `MatrixEvent` or
   `matrix-js-sdk/lib/matrixrtc`.
2. All MatrixRTC participation logic (session projection, own membership
   join/leave/keep-alive, transport tokens, media key exchange) comes from the
   crate's `FfiParticipationManager`. Element Call keeps only what the crate
   deliberately leaves to the host: the LiveKit media plane, tiles, room
   metadata, reactions, notifications, UI.
3. The standalone SPA, widget mode and `sdk/main.ts` construct a
   `JsSdkMatrixDriver` (a port of the draft's `web-test-app/src/jsSdkDriver.ts`
   that also works on js-sdk's `RoomWidgetClient`, extended with what Element
   Call needs beyond RTC) and stop using `client.matrixRTC`.
4. Every existing gate stays green: `pnpm lint` (tsc, oxlint, knip, component
   externals), `pnpm format:check`, `pnpm test` (unit + storybook),
   `pnpm i18n:check`, all four builds, Playwright (standalone, widget,
   component).

**Non-goals**

- Replacing `matrix-js-sdk` in the standalone shell (login, registration, room
  creation, home page, crypto bootstrap). The shell keeps its client and wraps
  it. `src/home/useGroupCallRooms.ts` stays on `client.matrixRTC` for now.
- Removing `matrix-js-sdk/lib/logger`. It is isolated behind
  `src/utils/logger.ts` (S6) so a later swap is one line.
- Writing a matrix-rust-sdk-backed driver (Element X). The interface is shaped
  so one can be written; none is written here.
- Publishing the crate as an npm package: done upstream (`@element-hq/matrix-rtc`,
  built and published by `npm-web-bindings.yml` in matrix-rust-rtc; consumed
  here since 2026-09-16, §5.1).
- Turning on MSC4153 (cross-signed sender) enforcement. Parity first (§5.8).

---

## 2. Where the code is today (inventory)

Entry: `component/index.tsx` → `src/room/CallView.tsx` → `LobbyView` |
`ActiveCall` (`src/room/InCallView.tsx`) | `CallEndedView`. `ActiveCall`
builds the view model with
`createCallViewModel$(scope, rtcSession, matrixRoom, mediaDevices, muteStates, options, raisedHands$, reactions$, trackProcessorState$)`.

| Concern                          | Files                                                                                                                                                                                                                                              | js-sdk surface used                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session memberships              | `src/state/SessionBehaviors.ts`, `src/useMatrixRTCSessionMemberships.ts`                                                                                                                                                                           | `rtcSession.memberships`, `MembershipsChanged`, `membership.getTransport`, `isKeyRotationSuppressed`                                                                                                           |
| Own membership                   | `localMember/LocalMember.ts` (`enterRTCSession`), `localMember/HomeserverConnected.ts`                                                                                                                                                             | `joinRTCSession`, `leaveRoomSession(1000)`, `updateCallIntent`, `MembershipManagerEvent.*`, `ClientEvent.Sync`; delegation probe at `LocalMember.ts:298-313`, delegation through the JWT service at `:731-756` |
| SFU / JWT                        | `src/livekit/openIDSFU.ts`, `localMember/LocalTransport.ts`, `localMember/RtcTransportAutoDiscovery.ts`, `remoteMembers/Connection.ts`, `ConnectionFactory.ts`, `ConnectionManager.ts`                                                             | `getOpenIdToken`, `_unstable_getRTCTransports`, `POST /get_token` (+ `delay_id`, `delay_timeout`, `delay_cs_api_url`), legacy `/sfu/get`                                                                       |
| Remote member ↔ LiveKit identity | `remoteMembers/MatrixLivekitMembers.ts`                                                                                                                                                                                                            | `rtcBackendIdentity`, `userId`, `deviceId`, `memberId`                                                                                                                                                         |
| E2EE media keys                  | `src/e2ee/matrixKeyProvider.ts`, `src/e2ee/sharedKeyManagement.ts`                                                                                                                                                                                 | `EncryptionKeyChanged`, `reemitEncryptionKeys`, `room.hasEncryptionStateEvent`                                                                                                                                 |
| Room metadata                    | `remoteMembers/MatrixMemberMetadata.ts`, `src/utils/displayname.ts`, `src/room/useRoomName.ts`, `useRoomState.ts`, `useRoomAvatar.ts`, `useJoinRule.ts`, `InviteModal.tsx`, `CallView.tsx`                                                         | `getMembersWithMembership`, `RoomStateEvent.Members`, `room.name`, `getMxcAvatarUrl`, `getJoinRule`, `getCanonicalAlias`                                                                                       |
| Own profile / avatars            | `src/profile/useProfile.ts`, `src/Avatar.tsx`                                                                                                                                                                                                      | `getUser`, `UserEvent.*`, `setDisplayName`, `setAvatarUrl`, `uploadContent`, `mxcUrlToHttp`, `getAccessToken`                                                                                                  |
| Reactions / hand raise           | `src/reactions/ReactionsReader.ts`, `useReactionsSender.tsx`, `src/reactions/index.ts`                                                                                                                                                             | `RoomEvent.Timeline/Redaction/LocalEchoUpdated`, `MatrixEventEvent.Decrypted`, `relations.getChildEventsForEvent`, `sendEvent`, `redactEvent`, membership `eventId`, `RelationType`                            |
| Call notifications               | `CallViewModel/CallNotificationLifecycle.ts`                                                                                                                                                                                                       | `DidSendCallNotification`, `RoomEvent.Timeline` + `EventType.RTCDecline`                                                                                                                                       |
| Rageshake / dev settings         | `src/settings/submit-rageshake.ts`, `rageshake.ts`, `FeedbackSettingsTab.tsx`, `DeveloperSettingsTab.tsx`                                                                                                                                          | `getCrypto`, `sendEvent(org.matrix.rageshake_request)`, `ClientEvent.Event`, `secureRandomString`, `doesServerSupportUnstableFeature`, `getSFUConfigWithOpenID`                                                |
| Analytics                        | `src/analytics/PosthogEvents.ts`, `PosthogAnalytics.ts`                                                                                                                                                                                            | `rtcSession.statistics`, account data                                                                                                                                                                          |
| Types only                       | `src/UrlParams.ts`, `src/state/MediaDevices.ts`, `AndroidControlledAudioOutput.ts`, `IOSControlledAudioOutput.ts`, `initialMuteState.ts`, `state/media/RingingMediaViewModel.ts` (`RTCCallIntent`), `src/useEvents.ts` (`TypedEventEmitter` types) | replaced by a local `CallIntent` type / kept as generic emitter typing                                                                                                                                         |
| Runtime misc                     | `src/useLocalStorage.ts` (`TypedEventEmitter`), `src/room/GroupCallErrorBoundary.tsx` (`MatrixError`), `src/room/KnockLobbyView.tsx` (shell)                                                                                                       | see S6                                                                                                                                                                                                         |
| Context                          | `src/ClientContext.tsx`                                                                                                                                                                                                                            | `useClient`/`useClientState` used by `Avatar`, `sharedKeyManagement`, `useReactionsSender`, `submit-rageshake`                                                                           |

Hosts: `component/index.tsx:291`, `src/room/useLoadGroupCall.ts:335`,
`sdk/main.ts:128` (own `MatrixRTCSessionManager`; waits on
`MatrixRTCSessionEvent.JoinStateChanged` at `:292`). Test kit:
`src/utils/test.ts` (`MockRTCSession`, `mockRtcMembership`, `mockMatrixRoom`),
`src/utils/test-viewmodel.ts`, `CallViewModelTestUtils.ts`. Baseline on
`main` (fe911628): tsc green, 97 unit files / 757 tests green.

Component build: `vite-component.config.ts` (single string `fileName`,
externals list with 18 `matrix-js-sdk/lib/*` subpaths), `pnpm lint:externals`,
`component/package.json` (`matrix-js-sdk: "*"` peer, `exports` without a
wildcard).

---

## 3. What the crate gives us, what it does not, and what must change in it

Verified against `src/uniffi_api/mod.rs`, `src/participation/mod.rs`,
`src/session/state.rs`, `src/own_membership/machine.rs`,
`src/encryption/matrix_encryption_event.rs` and the generated
`web-test-app/src/generated/matrix_rtc.ts` (acceptance suites: 32 pass).

**Provided** (`FfiParticipationManager`, one per `(room, slot)`, any number
share one `FfiMatrixDriver`):

- `join(FfiTransportIntent, FfiJoinParams)` / `leave(code?, reason?)`; a
  `Publish` intent with a bare LiveKit transport triggers discovery through
  `driver.getRtcTransports()` (`connections/mod.rs:470-499`); a driver _error_
  there is `NoTransport`, not a fallback.
- `memberships()` + listener: `FfiMembership { member { memberId, userId,
deviceId, displayName?, avatarUrl?, intent?, applicationType?,
publishedTransports, canSubscribe }, state: Joined | LeftWithKeys,
connections: serviceUrl[] (the FFI doc comment saying ws urls is wrong),
transportIdentity?, mediaKey? }`. `transportIdentity` is today's
  `rtcBackendIdentity`. `LeftWithKeys` entries have empty `connections`.
- `connections()` + listener: `{ connection { serviceUrl, wsUrl, jwtToken,
expiresAtTs }, members }[]`; tokens re-minted a minute before `exp`.
- `keyMap()` + `setKeyMapListener(map, change)`: `FfiMediaKey { memberId, key:
ArrayBuffer, index, creationTsMs: bigint }`, inbound keys **and our own**
  (`encryption/inbound.rs:251-257`).
- `status()` + listener: `Disconnected{cause} | Joining | Connected{keepAlive,
membership, roster, encryption, impairments} | Leaving`.
- `session()`, `ownMemberId()` (available as soon as `join()` starts),
  `ownMembership()`, `connectionProblems()`, `debugSnapshot()`.
- Member display names and avatars, from the room's `m.room.member` state
  (C8): the session keeps them current, so a rename is a memberships change.
- Slots are required: once the seed has read slot state, a slot with no event
  is closed, so a room without an `m.rtc.slot` has no call, in every dialect.
  `openSlot(application, encrypted)` / `closeSlot()` send the state event;
  the slot id `m.call#ROOM` matches js-sdk's default.
- `FfiElementCallCompat.{Off, StateEvents}`: spec MSC4143, or MSC3401 state
  events for the clients that predate sticky events (C9 removed the never
  deployed 2025 sticky dialect).
- All `u64` fields are `bigint` in TypeScript; `Vec<u8>` is `ArrayBuffer`.
- Listener callbacks arrive one timer tick after the emitting call (pumps
  sleep through `setTimeout`, `executor.rs:86`); getters are fresh.

**Not provided — Element Call keeps it, through the driver** (§4.1 slices):

| Need                                                                           | Why not in the crate                                 | Where it goes                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Room name, alias, avatar, join rule, encryption flag                           | room metadata                                        | `RoomDriver.getRoomInfo`                                                                                                                 |
| Profiles of room members who are not in the call (ringing, name-tag threshold) | not RTC                                              | `RoomDriver.subscribeRoomMembers`                                                                                                        |
| Reactions, hand raise, `org.matrix.rageshake_request`                          | application events                                   | `TimelineDriver`                                                                                                                         |
| MSC4075 notification + decline                                                 | out of scope (only `wire_event_type` knows the type) | `TimelineDriver.sendRoomEvent`, decided in `CallNotificationLifecycle` (§4.3)                                                            |
| Own profile read/write                                                         | not RTC                                              | `ProfileDriver`                                                                                                                          |
| `mxc://` thumbnails with auth                                                  | not RTC                                              | `MediaDriver.thumbnailUrl`                                                                                                               |
| Homeserver sync connectivity                                                   | needed by the crate too                              | `RtcMatrixDriver` (`isHomeserverConnected`, `subscribeConnectivity`, C12); reaches Element Call as `HomeserverUnreachable` in the status |
| Sticky-events support probe                                                    | capability probe                                     | `MatrixDriver.getMatrixClientFeatures()`                                                                                                         |

**Must change in the crate (S0a) — each blocks a later slice:**

| #   | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | A successful `read_state("m.rtc.slot")` returning `[]` marks slot state supplied and every slot other than the legacy `""` resolves `Closed` (`session/state.rs`); `join()` then fails with `SlotClosed` and every MSC4143 peer is excluded. Element Call never sent `m.rtc.slot`.                                                                                                                                                                      | **Kept as the crate has it: no slot means no call.** Element Call opens the slot when nobody has (`RtcParticipationManager.join` with a `SlotPolicy`: `openSlot("m.call", encrypted)`, then wait for the echo), which needs the power level to send `org.matrix.msc4143.rtc.slot`; without it the join fails with `NoOpenSlotError`. Existing rooms keep working because the first call in a room opens its slot. A compat-mode relaxation was tried and reverted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| C2  | `manage_media_keys`, `require_cross_signed_sender`, `use_key_delay_ms` are not settable over the FFI; defaults are `true`, `true`, 1000 ms.                                                                                                                                                                                                                                                                                                             | New record `FfiParticipationConfig { compat, manage_media_keys, require_cross_signed_sender, use_key_delay_ms }` as the constructor argument (replaces the bare `compat`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C3  | `StickyEvents` compat sent keys as `org.matrix.msc4143.rtc.encryption_key` while deployed clients read only `io.element.call.encryption_keys`.                                                                                                                                                                                                                                                                                                          | Made moot by C9 and reverted with it: the sticky dialect goes away entirely, so `Off` sends the spec key message and `StateEvents` the legacy one, with no middle case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C4  | `FfiMember` has no membership `event_id`; reactions relate to it (§4.3).                                                                                                                                                                                                                                                                                                                                                                                | `Member.event_id: Option<String>` threaded through `session/dispatch.rs` → `convert/*` → `state.rs` (currently dropped at `state.rs:402`) → `FfiMember.event_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C5  | **Done.** Delegating the delayed leave (MSC4195) is split between the crate and the host: the draft's driver method makes the _adapter_ perform the whole delegation, its demo adapter calls a homeserver endpoint that 401s on a widget client, and Element Call today does it differently (probe, then the authorisation service's `get_token` with `delay_id`/`delay_timeout`/`delay_cs_api_url`). Nothing of this exists in the real `crates/` yet. | **The crate owns the policy; the driver keeps two primitives.** (a) `delegate_delayed_leave_via_homeserver(room, slot, member, delay_id)`: one authenticated POST to the CS API endpoint (`/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`, the spelling Element Call probes today; a widget client answers `Unsupported`). (b) `LivekitTokenRequest.delegation: Option<{ delay_id, delay_timeout_ms }>`: the adapter appends `delay_id`, `delay_timeout` and `delay_cs_api_url` (its own homeserver URL) to the `get_token` / `sfu/get` body it already sends. The own-membership machine tries (a) first and, on `Unsupported` or any failure, (b) against the transport we publish on, i.e. Element Call's OpenID → JWT → scheduled-event path; only if both fail does it keep restarting the switch itself. **Arm-after-confirm:** the short delayed leave stays armed through the join; delegation arms a second, ≥ 1 h delayed leave, delegates _that_, and cancels the short one on success (or the long one on failure), so no moment is left without an armed leave and a failed delegation costs nothing. `KeepAlive::Delegated` says which route succeeded. The interim C5 (service URL and delay on the request) and Element Call's driver-side probe and JWT delegation are replaced by this. **Real-backend check (2026-09-15):** both routes send the MSC4195 `member` _claims_ (`{ id, claimed_user_id, claimed_device_id }`), not the member block of the event. The homeserver route body is what lk-jwt-service 0.7 accepts behind a Synapse that proxies `rtc/livekit/*` to it (MSC4512, `backend/app-service.yaml`): `{ url, room_id, slot_id, member, delay_id, delay_timeout }`, where `url` is the SFU websocket URL the transport's token named (the service checks it is its own). The transport resolver therefore returns `ResolvedTransport { transport, sfu_url }` and the machine carries the url into `Action::DelegateViaHomeserver`; without an SFU url it goes straight to the service route, and a receive-only member (no transport) delegates nothing. Verified end to end against `pnpm backend`: the homeserver route takes the 1 h leave (`KeepAlive::Delegated { via: Homeserver }`, one delayed event of 3 600 000 ms on the server). |
| C6  | The transport identity is a pure function (`connections/mod.rs:116-135`) but not exported; the own identity is needed before our membership echo to set our own media key.                                                                                                                                                                                                                                                                              | Export `FfiParticipationManager.own_transport_identity(): Option<String>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C7  | Doc comment on `FfiMembership.connections` says `ws_url`s.                                                                                                                                                                                                                                                                                                                                                                                              | Fix the comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| C8  | Both converters set `display_name` / `avatar_url` to `None`, so every host would re-derive them from room members.                                                                                                                                                                                                                                                                                                                                      | The session records each `m.room.member` profile (whether or not the roster condition is enforced) and stamps it on members at projection time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C9  | `ElementCallCompat::StickyEvents` models the 2025 Element Call sticky dialect (`member: {user_id, device_id, id}`, flat `rtc_transports`, `versions`, legacy key message). No deployment uses it: sticky-event calls have not shipped.                                                                                                                                                                                                                  | **Done.** Removed: `own_membership/compat_2025.rs`, the 2025 block in `session/convert/msc4143.rs` and its dispatch arm, the `StickyEvents` variants of `ElementCallCompat` / `FfiElementCallCompat`, and their tests and acceptance tests; `outbound_event_type` / `build_content` keep two arms (`Off`, `StateEvents`). Element Call then maps `Matrix_2_0 → Off`: spec MSC4143 sticky events with slots (which Element Call opens, C1) and the spec key message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C10 | `MediaKeyState` has `holds_our_key`, `have_their_key` and `rejection`, so a tile learns about an unsigned sender only when `require_cross_signed_sender` is on (the key is discarded, `rejection: NotCrossSigned`). With the check off the verdict is dropped on accept and the tile cannot show an unverified sender.                                                                                                                                  | **Done.** The inbound key store keeps the MSC4153 verdict of the accepted key per member and exposes it as `FfiMediaKeyState.sender_cross_signed: Option<bool>` (`None` when the host could not tell). Element Call runs with the check off (§5.8) and wants to show the state on the tile until it is turned on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C11 | No way to change `application["m.call.intent"]` while joined; Element Call flips it between `audio` and `video` when the camera is toggled (`updateCallIntent`).                                                                                                                                                                                                                                                                                        | `update_application(intent)` on the own-membership manager, facade and FFI: while connected the membership is re-published at once on the refresh path (a failure retries like a refresh); during a join the join event carries it; refused with `NotJoined` otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C12 | Homeserver connectivity lived only in Element Call's driver; the crate could not tell a dead homeserver from a quiet one, and a participation's status said nothing about it.                                                                                                                                                                                                                                                                           | **Done.** `ConnectivityDriver` (`is_homeserver_connected`, `subscribe_connectivity`) joins the `MatrixDriver` sum; the FFI adds `ConnectivitySink`, the two callback methods and `FfiParticipationManager.is_homeserver_connected()`; the facade pump consumes the stream and reports `Impairment::HomeserverUnreachable { since_ts }` (Critical, sorted first) in every non-disconnected status until the driver reports the homeserver back. The web-test-app mock and js-sdk driver implement it. A matrix-rust-sdk adapter implements the same two methods later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C13 | `session()` moved (seed done, slot opened by somebody else) without any listener firing, so a host's `session$` stayed stale until a membership or status change happened to refresh it. Found by the real-backend check.                                                                                                                                                                                                                               | **Done.** `SessionListener` / `set_session_listener` on the FFI manager (`on_session_change` on the facade), fired publish-on-change from `refresh_outputs`; `RtcParticipationManager.session$` is fed from it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| C14 | The crate logs through the `log` facade (104 call sites) but installed no logger, so in wasm every line was dropped: seeding, joins, delegation fallbacks and key rotation left no trace in a rageshake.                                                                                                                                                                                                                                                | **Done (2026-09-16).** `LogSink` foreign trait (`log(level, target, message)`), `FfiLogLevel`, and `set_log_sink(sink, max_level)`, which installs a `log::Log` forwarding to the sink (a host that already installed a Rust logger keeps it). Element Call installs `matrixRtcLogSink` under `[matrix-rtc]` on the js-sdk root logger from `initMatrixRtcSdk()` at debug; the web-test-app installs a console sink (warn in tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

No crate work is deferred: `update_application` is C11.

---

## 4. Target architecture

```text
host (SPA · widget · sdk · a third-party page)
  ├─ RtcMatrixDriver             = the crate's MatrixDriverCallback, verbatim
  │                                (events, to-device, tokens, sinks, connectivity)
  └─ ElementCallMatrixClientDriver = RoomDriver + TimelineDriver + ProfileDriver
                                     + MediaDriver + capabilities
        │
        ▼  component/index.tsx  <ElementCall rtcDriver clientDriver …/>
  ┌─ MatrixDriverProvider (src/driver/MatrixDriverContext.tsx) ─────────────┐
  │  CallView owns one RtcParticipationManager for lobby → call → ended               │
  │  RtcParticipationManager (src/state/rtc/RtcParticipationManager.ts)                          │
  │    FfiMatrixDriver(driver) → FfiParticipationManager(room, slot, me, cfg)│
  │    memberships$ · connections$ · keyChanges$ · status$ · session$        │
  │    ownMemberId$ · ownMembership$ · ownTransportIdentity$                 │
  │    join(intent, params) · leave(reason)                                  │
  │        │                                                                 │
  │        ▼                                                                 │
  │  createCallViewModel$(scope, callParticipation, roomInfo, mediaDevices, …)   │
  │    ConnectionManager  ← connections$ (wsUrl + jwt; no OpenID in EC)      │
  │    RemoteMembers      ← memberships$ (transportIdentity ↔ LK participant)│
  │    MatrixKeyProvider  ← keyChanges$ (memberId → transportIdentity)        │
  │    LocalMember        ← status$, ownMembership; join/leave → participation│
  │    MemberMetadata     ← driver.room members                              │
  │    Notifications      ← driver.timeline + memberships$                   │
  │  React: Lobby / InCall / Settings / Avatar / Reactions                   │
  │    read the driver via useMatrixDriver(), never a client                 │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 The two drivers (host-facing, framework-neutral)

Two files, two objects. `src/driver/RtcMatrixDriver.ts` is one line: the
crate's `MatrixDriverCallback`, re-exported. Everything MatrixRTC, including
homeserver connectivity (C12), goes through it and is consumed by the crate.
`src/driver/ElementCallMatrixClientDriver.ts` is what a call needs beyond
MatrixRTC. Plain TypeScript: async methods and
`subscribeX(listener) → unsubscribe` pairs, mirroring the crate's sink style.
No RxJS crosses this boundary; Element Call wraps subscriptions into
`Behavior`s internally (`src/driver/observe.ts`).

```ts
export interface ElementCallMatrixClientDriver
  extends RoomDriver, TimelineDriver, ProfileDriver, MediaDriver {
  readonly userId: string;
  readonly deviceId: string;
  /** The room this driver is bound to (one driver per room, as in the crate). */
  readonly roomId: string;
  getMatrixClientFeatures(): Promise<MatrixClientFeatures>;
  /** Free-form diagnostics for rageshakes (crypto version, sync state, …). */
  getDiagnostics?(): Promise<Record<string, string>>;
}
export interface MatrixClientFeatures {
  stickyEvents: boolean;
  /** The host's events carry decryption metadata (false on a widget client). */
  verifiedEventOrigins: boolean;
  /** The host can evaluate MSC4153 cross-signing of senders. */
  crossSigningVerdicts: boolean;
}

// src/driver/RtcMatrixDriver.ts
export type RtcMatrixDriver = MatrixDriverCallback;

export interface RoomInfo {
  name: string;
  canonicalAlias: string | null;
  avatarUrl: string | null;
  joinRule: string | null;
  encrypted: boolean;
}
export interface RoomMemberProfile {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  membership: "join" | "invite";
}
export interface RoomDriver {
  getRoomInfo(): RoomInfo;
  subscribeRoomInfo(listener: (info: RoomInfo) => void): () => void;
  getRoomMembers(): RoomMemberProfile[];
  subscribeRoomMembers(
    listener: (members: RoomMemberProfile[]) => void,
  ): () => void;
}

export interface TimelineEvent {
  eventId: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  originServerTs: number;
  redacts?: string;
}
export interface TimelineDriver {
  sendRoomEvent(
    eventType: string,
    content: unknown,
  ): Promise<{ eventId: string }>;
  redactEvent(eventId: string): Promise<void>;
  /** Decrypted live room events (not sticky), incl. redactions; no local echoes. */
  subscribeTimeline(listener: (event: TimelineEvent) => void): () => void;
  /** Events already known that relate to `eventId` (hand-raise catch-up). */
  getRelatedEvents(
    eventId: string,
    relType: string,
    eventType: string,
  ): TimelineEvent[];
}

export interface OwnProfile {
  displayName: string | null;
  avatarUrl: string | null;
}
export interface ProfileDriver {
  getOwnProfile(): OwnProfile;
  subscribeOwnProfile(listener: (profile: OwnProfile) => void): () => void;
  /** Absent when the host does not allow profile changes. */
  setDisplayName?(name: string): Promise<void>;
  setAvatar?(file: Blob): Promise<void>;
}

export interface MediaDriver {
  /** An `<img>`-usable URL for an mxc thumbnail (may be a blob: URL), or null. */
  thumbnailUrl(
    mxcUrl: string,
    width: number,
    height: number,
    resizeMethod: "crop" | "scale",
  ): Promise<string | null>;
}
```

The client driver is a union of capability slices, the way the crate splits
its own driver; the RTC driver is the crate's contract untouched, so a host
with a crate-side adapter (matrix-rust-sdk) implements nothing extra for
MatrixRTC.

### 4.2 `RtcParticipationManager` (Element Call's RxJS view of the manager)

Naming: _participation_ is the crate's FFI concept (`FfiParticipationManager`,
`FfiParticipationConfig`); `RtcParticipationManager` is Element Call's RxJS wrapper
over it.

`src/state/rtc/RtcParticipationManager.ts`, a class taking the scope in its constructor:

```ts
new RtcParticipationManager(scope, driver, {
  slotId: "m.call#ROOM", compat, manageMediaKeys, requireCrossSignedSender,
  useKeyDelayMs, transportFallbackUrl?, logger })
  memberships$: Behavior<Epoch<FfiMembership[]>>   // Joined only; LeftWithKeys filtered (v1)
  connections$: Behavior<FfiConnectionWithMembers[]>
  keyChanges$:  Observable<FfiMediaKey>             // one changed key per emission
  keyMap$:      Behavior<FfiMediaKey[]>
  status$:      Behavior<FfiStatus>
  session$:     Behavior<FfiSessionSnapshot>
  ownMemberId$: Behavior<string | null>
  ownTransportIdentity$: Behavior<string | null>
  ownMembership$: Behavior<FfiMembership | null>
  join(intent: FfiTransportIntent, params: FfiJoinParams): Promise<void>
  leave(code?: string, reason?: string): Promise<void>
```

- Wraps `new FfiMatrixDriver(driver)` and `new FfiParticipationManager(...)`;
  `uniffiDestroy()` on scope end (leave first unless `Disconnected`).
- `transportFallbackUrl` decorates `getRtcTransports`: when the host's call
  **throws or returns no LiveKit transport**, answer with
  `Config.get().livekit.livekit_service_url` (today's precedence,
  `RtcTransportAutoDiscovery.ts:72-94`).
- Lives at `CallView` level (the lobby reads memberships for the participant
  count, auto-mute threshold and notification decision, `CallView.tsx:164-413`;
  `useReactionsSender` needs the own membership). `join()` after `leave()` on
  one manager is supported and mints a fresh member id.
- Behaviors are seeded from the getters and updated by the listeners.

### 4.3 `createCallViewModel$` after the change

```ts
createCallViewModel$(
  scope,
  participation,
  roomInfo,
  mediaDevices,
  muteStates,
  options,
  handsRaised$,
  reactions$,
  trackProcessorState$,
);
// roomInfo: { roomId, userId, deviceId, members$: Behavior<RoomMemberProfile[]>,
//             homeserverConnected$: Behavior<boolean>, timeline: TimelineDriver }
```

| Today                                                               | After                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMemberships$(scope, rtcSession)`                             | `callParticipation.memberships$`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `membershipsAndTransports$` (`getTransport(oldest)`)                | `membership.connections[]` (service urls)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `createLocalTransport$` + `RtcTransportAutoDiscovery` + `openIDSFU` | deleted; `join(Publish(custom url or bare))`; own transport = `ownMembership.member.publishedTransports[0]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Connection.start()` fetching a JWT                                 | `Connection` takes `{ wsUrl, jwt, expiresAtTs }` from `connections$`, keyed by `serviceUrl`, holds `token$`; a refreshed token is used on the next full (re)connect; `expiresAtTs` logged on connect; `livekitAlias` decoded from the JWT stays                                                                                                                                                                                                                                                                                                                             |
| `createRemoteMatrixLivekitMembers$` on `rtcBackendIdentity`         | matches `membership.transportIdentity`; key = `member.memberId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `MatrixKeyProvider.setRTCSession`                                   | `MatrixKeyProvider.attach(participation)`: `keyChanges$` × `memberships$` × `ownTransportIdentity$` → `onSetEncryptionKey(material, identity, index)`; keys whose member has no identity yet are held per member id and replayed                                                                                                                                                                                                                                                                                                                                            |
| `enterRTCSession` (`joinRTCSession(...)`)                           | `callParticipation.join(intent, joinParamsFromConfig(...), { encrypted: roomInfo.encrypted, canOpen: roomInfo.canOpenSlot })` in the same `scope.reconcile`: opens the room's slot first when none is open (power level permitting, otherwise `NoOpenSlotError`), then joins; cleanup calls `callParticipation.leave()`                                                                                                                                                                                                                                                     |
| `createHomeserverConnected$`                                        | `status$` alone: `Impairment::HomeserverUnreachable` (C12) = disconnected; `Connected` with `keepAlive` `Armed`/`Delegated`/`Unavailable` = connected; `RestartFailing`/`Expired` = reconnecting (**behaviour change**: local media pauses in that window, today it does not). Outside a participation, `RtcParticipationManager.homeserverConnected$` from the manager's getter                                                                                                                                                                                                  |
| `delayId$` + JWT-service delegation                                 | gone from Element Call. `FfiJoinParams.delegateDelayedLeave` is always `true`; the crate tries the CS API, then the authorisation service's token endpoint (with `delay_id`, `delay_timeout`, `delay_cs_api_url`), then falls back to its own restarts (C5). `config.matrix_rtc_session.delegated_delayed_leave.delay_ms` becomes `FfiJoinParams.delegatedDelayMs` (default 1 h)                                                                                                                                                                                            |
| `createMatrixMemberMetadata$(scope, matrixRoom)`                    | tiles read `member.displayName` / `avatarUrl` from the crate; disambiguation runs over the call's members; `roomInfo.members$` remains only for the ringing name and the name-tag threshold                                                                                                                                                                                                                                                                                                                                                                                 |
| `createSentCallNotification$` / `createReceivedDecline$`            | `CallNotificationLifecycle`: after **our own membership echo** (`ownMembership$` non-null) and when no other member was in the session before our join, send `m.rtc.notification` (wire `org.matrix.msc4075.rtc.notification`) via `driver.sendRoomEvent` with the fields js-sdk sends today (`m.mentions`, `notification_type`, `sender_ts`, `lifetime` 90 s, `m.call.intent`, `m.relates_to: m.reference → own membership event id`, `MatrixRTCSession.ts:725-756`); decline from `driver.subscribeTimeline` on both `org.matrix.msc4310.rtc.decline` and `m.rtc.decline` |
| `updateCallIntent` on camera toggle                                 | `callParticipation.updateApplication(videoEnabled ? "video" : "audio")` (C11); Element X's room-header intent keeps following the camera                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `createKeyRotationSuppressed$` + `key_rotation_participant_limit`   | dropped (the crate has no participant limit; the indicator has no equivalent)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rtcSession.statistics` (PostHog)                                   | counts of `keyChanges$` (sent = own member id, received = others)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `MembershipManagerError` → `StickyEventsRequiredError`              | `status$` `Disconnected{cause: JoinFailed{error: Driver/Unsupported}}` → `StickyEventsRequiredError`; `NoTransport` → `MatrixRTCTransportMissingError`; `ManagerStopped`/`SlotClosed` → `ConnectionLostError`                                                                                                                                                                                                                                                                                                                                                               |
| `impairments`                                                       | fed into the inert `src/state/ServiceInterruptionsViewModel.ts` (S6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Join parameters (`joinParamsFromConfig`, from `Config.get().matrix_rtc_session`):
`stickyDurationMs = BigInt(Math.min(membership_event_expiry_ms ?? 4 h, 1 h))`
(js-sdk caps sticky at 1 h, the crate clamps to 1 h; the config default is
undefined today); `keepAliveTimeoutMs = BigInt(delayed_leave.delay_ms)`;
`degradedLifetimeMs = undefined`; `applicationType = "m.call"`;
`intent = options.callIntent`. Config keys that stop having an effect and are
documented as such in `docs/`: `delayed_leave.restart_ms`,
`restart_timeout_ms`, `network_error_retry_ms`,
`key_rotation_participant_limit`, `delegated_delayed_leave.*` (the crate arms
1 h when delegating). `wait_for_key_rotation_ms` maps to
`FfiParticipationConfig.useKeyDelayMs`.

Compat: `MatrixRTCMode.Compatibility → StateEvents`, `Matrix_2_0 → Off` (spec
MSC4143: sticky member events, slots, the spec key message), in
`compatForMode`.

### 4.4 React tree

- `src/driver/MatrixDriverContext.tsx`: `MatrixDriverProvider` holding both
  drivers, `useRtcMatrixDriver()` / `useClientDriver()`; replaces every
  `useClient()`/`useClientState()` under `CallView`. `ClientContext` stays for the shell.
- `CallView` props: `{ driver, isPasswordlessUser, confineToRoom, preload, skipLobby }`.
  It creates the `RtcParticipationManager` (scope tied to its mount) and hands it to
  `LobbyView`, `ActiveCall`, `useReactionsSender`. `MatrixInfo` comes from
  `driver.getRoomInfo()` / `driver.getOwnProfile()`.
- `InCallView`'s own id becomes `${driver.userId}:${driver.deviceId}`.
- `Avatar` → `driver.thumbnailUrl` (host bridge `downloadMedia` first).
- `useProfile(client)` → `useOwnProfile()`; `ProfileSettingsTab` hides editing
  when `setDisplayName` is absent.
- `ReactionsReader(scope, participation, driver)`, `useReactionsSender` over
  `TimelineDriver`. Relation target stays the **current own membership event
  id** (`member.eventId`, C4) — protocol status quo; the reader keys raised
  hands by `memberId` and re-resolves the event id on re-send instead of
  dropping the hand.
- `useRoomEncryptionSystem` reads `getRoomInfo().encrypted`.
- `submit-rageshake`: `useMatrixDriver()` for ids and `getDiagnostics?()`;
  rageshake requests via `subscribeTimeline`.
- `DeveloperSettingsTab`: sticky probe → `getMatrixClientFeatures()`; custom LiveKit
  URL validation → `driver.getLivekitToken(...)`.
- `window.rtcSession` debug handle → `window.matrixRtc = { participation }`.

### 4.5 Hosts

- **Component**: `ElementCallProps.rtcDriver: RtcMatrixDriver` and
  `clientDriver: ElementCallMatrixClientDriver`; `roomId` stays as an
  **optional** prop for one release and must equal `clientDriver.roomId` when given
  (assertion), then goes. `initializeElementCall(config, { matrixRtcWasm? })`
  awaits `initMatrixRtcSdk()`. Externals shrink to `react*`, `livekit-client`,
  `matrix-js-sdk/lib/logger`. `JsSdkRtcMatrixDriver` and `JsSdkElementCallMatrixClientDriver` are
  exported from a second entry `@element-hq/element-call-component/matrix-js-sdk` (needs
  `lib.fileName` as a function and a new `exports` key); only that entry has
  `matrix-js-sdk` as a peer.
- **SPA / widget**: `useLoadGroupCall` returns the `Room`; `RoomPage` memoises
  the two js-sdk drivers and renders `<CallView rtcDriver clientDriver>`. The
  widget capability list in `src/widget.ts` grows by: send and receive state
  `m.rtc.slot` and `org.matrix.msc4143.rtc.slot` (opening the slot), `m.room.avatar`,
  `m.room.canonical_alias`, `m.room.join_rules`; send/receive to-device
  `org.matrix.msc4143.rtc.encryption_key` and `m.rtc.encryption_key`
  (alongside `io.element.call.encryption_keys`); events `m.rtc.decline`.
- **`sdk/main.ts`**: builds the driver from the widget client, a
  `RtcParticipationManager`, and waits on `status$` instead of `JoinStateChanged`.
- **`component/dev` harness**: the two js-sdk drivers per pane.

### 4.6 The js-sdk drivers — two classes, two clients each

`src/driver/jsSdk/JsSdkRtcMatrixDriver.ts` (the crate seam, a port of the
draft's `jsSdkDriver.ts`, connectivity from `ClientEvent.Sync`) and
`JsSdkElementCallMatrixClientDriver.ts` (the §4.1 slices), both written so
that they work on a full `MatrixClient`
**and** on js-sdk's `RoomWidgetClient` (`node_modules/matrix-js-sdk/src/embedded.ts`).
Differences from the draft, all required by the widget client:

- to-device inbound: listen on `ClientEvent.ToDeviceEvent` (the widget client
  never emits `ReceivedToDeviceMessage`, `embedded.ts:788-802`); on a full
  client use `ReceivedToDeviceMessage` for the `encryptionInfo`.
- to-device outbound: always `encryptAndSendToDevice` (works without a crypto
  backend on the widget client, `embedded.ts:598-612`; plain `sendToDevice`
  there is **unencrypted**, `:614-619`).
- transports: `client._unstable_getRTCTransports()` (the widget override,
  `embedded.ts:641-646`), never a raw `http.authedRequest`; `.well-known`
  fallback only on a full client.
- event origins: on a full client from decryption metadata (as the draft); on
  a widget client events arrive decrypted without metadata, so the driver
  reports `Encrypted{ senderDeviceId: content.member.device_id }` for member
  events and `Encrypted{ senderDeviceId: content.device_id }` for key
  events, i.e. the _claimed_ trust level js-sdk applies today
  (`ToDeviceKeyTransport.ts:133-140`). `getMatrixClientFeatures().verifiedEventOrigins`
  says which.
- cross-signing verdict: `undefined` on a widget client
  (`crossSigningVerdicts: false`); Element Call then forces
  `requireCrossSignedSender = false`.
- delegation: two primitives and no policy. `delegateDelayedLeaveViaHomeserver`
  is one `authedRequest` on a full client and `Unsupported` on a widget
  client; `getLivekitToken` appends `delay_id`, `delay_timeout` and
  `delay_cs_api_url` (`client.baseUrl`) when the request carries a
  delegation. The crate decides when to call which (C5). Element Call carries no
  delegation probe or policy.
- sticky listener attached after `startClient()` resolves (the widget room
  only exists then, `embedded.ts:326`).
- `getLivekitToken` reuses today's request shapes (`slot_id: "m.call#ROOM"`,
  legacy `/sfu/get`), errors mapped to `RtcError` incl. `M_LIMIT_EXCEEDED →
RateLimited`, 403 → `Rejected`, 404/`M_UNRECOGNIZED` → `Unsupported`.

---

## 5. Decisions and assumptions

1. **The SDK is an npm package.** `@element-hq/matrix-rtc` (the draft's
   `web-test-app/`, built by `npm-web-bindings.yml`: uniffi bindings, the
   wasm-bindgen glue, a `wasm-opt`'d ~760 KB wasm, `.d.ts`, and `@ubjs/core`
   as its own dependency) is a devDependency, aliased in `package.json` to
   `@billcarsonfr/matrix-rtc@next` while it is published from the fork, so
   the imports already say `@element-hq/matrix-rtc`. It lives on the GitHub
   Packages registry: `.npmrc` maps the scope, a `read:packages` token goes
   in `~/.npmrc` (CI: the `MATRIX_RTC_NPM_TOKEN` secret). **The GitHub
   Packages registry is a stop-gap** for the phase in which the crate's API
   moves with every push; once the SDK is ready for consumers beyond Element
   Call it belongs on npmjs.com as `@element-hq/matrix-rtc`, which drops the
   alias, `.npmrc`, the CI secret and every token requirement
   (`docs/matrix_rtc_sdk.md`). `src/matrix-rtc-sdk/`
   keeps only the loader (`initMatrixRtcSdk`: package `initAsync` + our log
   sink, wasm via `@element-hq/matrix-rtc/wasm?url`) and the curated
   re-exports. _History:_ until 2026-09-16 the bindings were vendored under
   `src/matrix-rtc-sdk/generated/` by `scripts/sync-matrix-rtc-sdk.sh`; local
   crate work now goes through `pnpm links:on` (`docs/linking.md`).
2. **Wasm loading.** Verified: Vite 8 library mode inlines `?url` and
   `new URL(…, import.meta.url)` assets as base64 regardless of
   `assetsInlineLimit`; `?url&no-inline` emits a file. App builds use `?url`;
   the component build uses `?url&no-inline` plus an `exports` entry for
   `./dist/assets/*`, and `initializeElementCall(config, { matrixRtcWasm })`
   lets a host point elsewhere. Wasm boot is **lazy** everywhere: in the app
   `useRtcParticipationManager` awaits `initMatrixRtcSdk()` before constructing
   the participation (so the js-sdk path never fetches it, §5.15), not the
   `Initializer`; vitest reads the file from disk and only suites that need
   it call `initMatrixRtcSdk()`, never in
   `src/vitest.setup.ts`; Storybook boots it in `.storybook/preview.tsx`
   `beforeAll`. Suites using `vi.useFakeTimers` never share a file with
   real-wasm tests (pumps sleep on `setTimeout`).
3. **Own identity via the driver.** `userId`/`deviceId` are properties of the
   driver, not props.
4. **One driver per room**, as in the crate.
5. **`matrix-js-sdk/lib/logger` stays** behind `src/utils/logger.ts`.
6. **`updateCallIntent` stays**, through the crate's `update_application` (C11).
7. **Reactions relate to the current own membership event id** (status quo);
   reader keys by `memberId`. Alternatives (stable join event id, or
   `memberId` as relation target) are protocol changes left to the user.
8. **MSC4153 default off** (`requireCrossSignedSender = false`) for every
   host, confirmed: js-sdk performs no such check today, and a passwordless
   SPA peer would otherwise be inaudible to everyone. The intent is to turn
   it on; the default carries a TODO (`src/state/rtc/joinParams.ts`), and C10
   puts the sender's verdict on the tile so the UI can show it meanwhile.
9. **Delegation is the crate's alone.** Element Call always asks for it; the
   crate tries the CS API, then the authorisation service's token endpoint,
   then its own restarts, and arms the long delegated leave only once
   delegation is confirmed (C5, done). Element Call keeps no probe and no
   delegation code; `delegated_delayed_leave.delay_ms` feeds
   `FfiJoinParams.delegatedDelayMs`.
10. **Widget trust model:** origins synthesised from claimed device ids equal
    today's js-sdk trust level; the crate records them as
    `DeviceAttribution::Verified` because it cannot tell. Documented in the
    driver; a `Claimed` attribution flag on the sink is a follow-up crate ask.
11. **Scratch files** go to `agent-workspace/oxidation/`; this plan lives at
    the repo root because it was asked for by name.
12. **Branch** `toger5/oxidation`, one commit per slice.
13. **Compatibility mode has no slot.** Under `StateEvents` the crate projects
    the session from the MSC3401 state events alone and requires the legacy
    slot id `""` (`LEGACY_SLOT_ID` in `src/state/rtc/slot.ts`,
    `slotIdForCompat`); `RtcParticipationManager` picks it from the config and skips
    the slot check and the slot open. Found by the real-backend check: with
    `m.call#ROOM` the crate saw its own legacy membership as a candidate but
    never projected it. Element Call's own rooms already let every member send
    the legacy member state event (`state_default: 0`); a plain room does not,
    which the backend test reproduces.
14. **Member events in encrypted rooms are Megolm-encrypted** by matrix-js-sdk
    (sticky events are timeline events; the SDK exempts only reactions and
    redactions), as they are with the js-sdk MatrixRTC code today. The driver
    decrypts them on the way in; the sticky marker (`msc4354_sticky`) stays in
    the clear. To cross-check against Element X before relying on it.
15. **The two view models stay switchable for one release.** A developer
    setting, `callViewModelImplementation` (`"matrix-js-sdk"` |
    `"matrix-rtc"`, `src/settings/settings.ts`, next to `matrixRTCMode`),
    picks between `createJsClientCallViewModel$` and the driver-based
    `createCallViewModel$` in the same build. Like `matrixRTCMode` it is
    shown in the Developer Settings tab, sampled when the call is joined
    (switching mid-call needs a rejoin), and a deployment can pin it through
    `config.json` (`call_view_model_implementation`), which overrides the
    user's choice and greys the control out. The default is
    `"matrix-js-sdk"` when the setting lands (S4a) and flips to
    `"matrix-rtc"` once the S5 gate is green; S6 removes the setting together
    with the js-sdk path. The point is that a broken call can be compared
    against the old path in the same session, and that Playwright can run
    both paths from one build. Everything the js-sdk path needs (the client,
    the `MatrixRTCSession`, `ReactionsReader` over the session) therefore
    stays reachable from `CallView` until S6, and the `RtcParticipationManager` is
    created only when the crate path is selected, so neither path pays for
    the other.

---

## 6. Work breakdown

Each slice is independently green (`pnpm lint && pnpm test:unit` at least).

### S0a — crate changes ☑ (in `MatrixSdkArchitectureDraft`)

C2–C12 from §3 (C1 reverted), each with a Rust unit test; acceptance tests in
`web-test-app/test/`: a slot-less room refuses joins until `openSlot`, in every dialect;
`FfiParticipationConfig` with `manageMediaKeys: false` exchanges no keys;
no `StickyEvents` variant left anywhere (C9); `member.eventId` present;
delegation tries the homeserver first, then the token endpoint with the delay fields, and keeps the short leave armed until one succeeds;
`ownTransportIdentity()` equals the joined membership's `transportIdentity`.
Gate: `cargo test --features uniffi`, `cargo clippy --all-targets --features uniffi -- -D warnings`,
`npm run ubrn:web && npm test`.

### S0b — SDK intake ☑

- ~~`scripts/sync-matrix-rtc-sdk.sh`, `src/matrix-rtc-sdk/generated/**`~~
  (replaced by the `@element-hq/matrix-rtc` package on 2026-09-16, §5.1),
  `src/matrix-rtc-sdk/index.ts` (loader + curated re-exports),
  `src/matrix-rtc-sdk/index.test.ts` (boot, one join round-trip against the
  TS mock driver).
- `package.json` (~~`@ubjs/core`~~ now `@element-hq/matrix-rtc`; the
  `generated/**` carve-outs in `knip.ts`, `.oxlintrc.json`, `.oxfmtrc.json`,
  `vitest.config.ts` and `.gitattributes` went with the vendored files),
  `vite.config.ts` (nothing needed for `?url`; verified `vite-plugin-wasm`
  ignores it), `tsconfig.json` untouched thanks to the `.d.ts`.
- Gate: `pnpm lint && pnpm format:check && pnpm test:unit`.

### S1a — driver interface, mock driver ☑

- `src/driver/RtcMatrixDriver.ts`, `src/driver/ElementCallMatrixClientDriver.ts`,
  `src/driver/observe.ts`, `MockRtcMatrixDriver.ts` (port of
  `web-test-app/src/mockDriver.ts`) and `MockElementCallMatrixClientDriver.ts`
  (in-memory room info, members, timeline, profile), with a test each.
- `knip.ts` `ignore` for `src/driver/**` until consumed, with the reason.

### S1b — `JsSdkMatrixDriver` ☑

- `src/driver/jsSdk/JsSdkRtcMatrixDriver.ts` and
  `JsSdkElementCallMatrixClientDriver.ts` (§4.6) + tests against **two**
  fakes: a `MatrixClient`-shaped one (`mockMatrixRoom`) and a
  `RoomWidgetClient`-shaped one (`ToDeviceEvent`, no crypto,
  `_unstable_getRTCTransports`, sticky updates after `startClient`).
  Asserts request shapes of `_unstable_sendStickyEvent`,
  `_unstable_sendStickyDelayedEvent`, `_unstable_updateDelayedEvent`,
  `encryptAndSendToDevice`, `/get_token` body with and without the delegation fields, `delegateDelayedLeaveViaHomeserver` on both clients,
  sink emission and origin synthesis, room-info/member updates.

### S2 — `RtcParticipationManager` ☑

- `src/state/rtc/RtcParticipationManager.ts`, `joinParams.ts`, `transportIntent.ts`,
  `errors.ts` (cause → `ElementCallError`).
- `RtcParticipationManager.test.ts` through the real wasm + `MockMatrixDriver`:
  memberships follow a remote join/leave; `LeftWithKeys` filtered; join →
  `Connected`; `connections$` carries the token; `keyChanges$` fires for a
  peer key; `ownTransportIdentity$` set before the echo; leave →
  `Disconnected{LeftByHost}`; join → leave → join; scope end destroys the
  manager; fallback transport when the host throws or advertises none.

### S3 — view model, four slices ☑ (side by side with the js-sdk view model)

- **Shape (2026-09-15):** the existing factory is renamed
  `createJsClientCallViewModel$` and the new `createCallViewModel$(scope,
participation, clientDriver, …)` sits next to it; both build a
  `CallViewModelCore` and hand it to the shared `assembleCallViewModel`, so
  the layout/tile half is one piece of code and the two Matrix sides can be
  reviewed side by side. `MatrixLivekitMember.membership$` is a neutral
  `CallMember` (`userId`, `deviceId`, `memberId`, `rtcBackendIdentity`) that
  js-sdk's `CallMembership` satisfies; `CallNotificationLifecycle` takes a
  neutral `DeclineEvent`. Nothing js-sdk is deleted yet (that is S6).
- **S3a** `remoteMembers/ParticipationConnections.ts`: one `Connection` per
  service URL in `participation.connections$`, started with the crate's
  token; a refreshed token keeps the connection (used on the next
  (re)connect). `Connection`/`ECConnectionFactory` accept a `null` client.
  Test fakes live in `src/utils/test-participation.ts`
  (`FakeParticipation`, `fakeMembership`, `fakeConnection`, `fakeMediaKey`).
- **S3b** `remoteMembers/ParticipationMembers.ts` (remote members matched by
  `transportIdentity`, keyed by `memberId`; `callMemberOf`) and
  `e2ee/participationKeyProvider.ts` (`keyMap$` × `memberships$` ×
  `ownTransportIdentity$` → `onSetEncryptionKey`, once per (member, index,
  identity); a key that arrives before the identity waits for the roster).
- **S3c** `localMember/LocalMedia.ts` is the LiveKit half extracted from
  `LocalMember.ts` (publisher, tracks, screen share, upstream pausing, host
  notify) and shared; `localMember/ParticipationLocalMember.ts` joins and
  leaves through the participation (slot policy from `roomInfo`, custom
  LiveKit URL as a `Publish` intent, `updateApplication` on camera toggle),
  derives connected / reconnecting / `probablyLeft` from `status$`
  (`HomeserverUnreachable` → "sync", `RestartFailing`/`Expired` →
  "probablyLeft") and the fatal error from `errorForStatus`. Deletions
  (`LocalTransport.ts`, `RtcTransportAutoDiscovery.ts`,
  `HomeserverConnected.ts`, `openIDSFU.ts`, `enterRTCSession`) wait for S6.
- **S3d** `ParticipationCallNotification.ts` sends `org.matrix.msc4075.rtc.notification`
  after our own echo when nobody was in the session before us (resets on
  leave) and reads declines from the `TimelineDriver`;
  `remoteMembers/ParticipationMemberMetadata.ts` adapts the client driver's
  roster to `RoomMemberMap` so `createMatrixMemberMetadata$` and the ringing
  name work unchanged. Still open: `ReactionsReader` on `participation` +
  `TimelineDriver` (the new factory takes the hands/reactions observables
  as inputs like the old one; S4b), `keyRotationSuppressed$` is `constant(false)`,
  and the js-sdk test kit stays until S6. Tests:
  `CallViewModel.participation.test.ts` (real wasm, mock drivers, mocked
  LiveKit: join → connection → own tile → peer → leave; transport-missing →
  `fatalError$`), plus one file per module.

### S4 — React tree, two slices ☑ (2026-09-16)

- **S4a-0, the switch (§5.15) ☑:** `CallViewModelImplementation` enum,
  `callViewModelImplementation` setting (`src/settings/settings.ts`),
  `call_view_model_implementation` pin (`ConfigOptions.ts`, validated in
  `Config.ts`), the radio group in `DeveloperSettingsTab.tsx`, the
  implementation logged at join and sent as `call_view_model_implementation`
  in rageshakes, `effectiveCallViewModelImplementation()` in
  `src/state/rtc/implementation.ts`. `CallView` samples it once per mount;
  with `matrix-rtc` and no drivers it warns and lets matrix-js-sdk carry the
  call. Still open from this item: the Playwright helper and the second CI
  run.
- **S4a done so far:** `MatrixDriverProvider` / `useMatrixDrivers()`
  (`src/driver/MatrixDriverContext.tsx`), provided by the component from its
  props and by `RoomPage` through `useJsSdkDrivers(client, room)`;
  `useRtcParticipationManager(drivers, config)` owned by `CallView`, created only
  when the crate path is selected; `ActiveCall` takes `participation` and
  builds either view model; the lobby's member count, the big-call auto-mute
  and the error boundary's "were we joined" read from whichever side carries
  the call; `window.matrixRtc = { participation }` next to `window.rtcSession`.
- (The original S4a-0 description follows for reference.) `callViewModelImplementation` setting and
  `config.json` pin (`ConfigOptions.ts`, validated at load like
  `matrix_rtc_mode`); a radio group in `DeveloperSettingsTab.tsx` beside the
  MatrixRTC mode; `ActiveCall` reads the sampled value and calls either
  factory — for `"matrix-rtc"` it takes the drivers from the
  `MatrixDriverProvider` and the `RtcParticipationManager` from `CallView`, for
  `"matrix-js-sdk"` it keeps `rtcSession`/`matrixRoom` as today. The chosen
  implementation is logged at join and added to the rageshake fields so a
  report says which path it came from. Playwright gets a helper that sets
  the setting (local storage) before the call so every call spec can run
  under both values; CI runs the suite twice until the default flips.
  Lands first in S4a, before anything else in the tree moves, so that every
  later S4 change is verifiable against the old path.
- **S4a** views/hooks/settings on the driver: `CallView.tsx` (owns
  `RtcParticipationManager` when the crate path is selected), `InCallView.tsx`, `LobbyView.tsx`, `CallEndedView.tsx`,
  `VideoPreview.tsx`, `useRoomInfo()` (replaces `useRoomName/Avatar/JoinRule/State`),
  `InviteModal.tsx`, `Avatar.tsx`, `useOwnProfile.ts`, `ProfileSettingsTab.tsx`,
  `SettingsModal.tsx`, `DeveloperSettingsTab.tsx`, `submit-rageshake.ts`,
  `analytics/PosthogEvents.ts`, `controls.ts`, and a
  first `CallView.stories.tsx` (lobby, in call, ended) driven by
  `MockMatrixDriver`.
- **S4b ☑ (2026-09-16):** `ReactionsSenderProvider` takes `ownIdentifier`,
  `ownMembershipEventId` and a `ReactionsTimeline` (`jsSdkReactionsTimeline`
  over a client, or the client driver); `ParticipationReactionsReader`
  (`src/reactions/`) reads hands and reactions from the participation and
  the timeline driver, keyed by the member's media id
  (`memberMediaId`, `src/state/rtc/mediaId.ts`), and re-resolves a hand on a
  re-sent membership instead of dropping it blindly. Notifications went
  through the driver in S3d. Tests: `ParticipationReactionsReader.test.ts`,
  `useRtcParticipationManager.test.tsx`, three `CallView.test.tsx` cases for the
  switch.
- **S4a views on the drivers (2026-09-16):** `CallView` now requires the
  drivers (`useMatrixDrivers()`; both hosts provide them) and reads the
  room through `useRoomInfo()` (`src/room/useRoomInfo.ts`; `useRoomAvatar`,
  `useJoinRule`, `useRoomState` deleted, `useRoomName` stays for `RoomPage`),
  our own profile through `useOwnProfile()` (`src/profile/useOwnProfile.ts`)
  and the encryption system through `useEncryptionSystemFor(roomId,
roomInfo.encrypted)` (`useRoomEncryptionSystem` keeps the client for the
  home page). `MatrixInfo` is built from those. `InviteModal` takes
  `roomId`/`roomName`/`e2eeSystem`; `CallEndedView` lost its `client` prop;
  `Avatar` resolves thumbnails through `clientDriver.thumbnailUrl` when
  drivers are provided (host `downloadMedia` first, client fallback for the
  shell); rageshakes carry the driver's `getDiagnostics()` as `driver_*`
  fields and the crate's `matrix_rtc_snapshot`.
- **The component is client-free (2026-09-16):** `CallView`'s `client` and
  `rtcSession` are optional; without them the crate carries the call
  whatever the setting says (`useMatrixRtc = setting || no session`), and
  every js-sdk-only piece (the `MembershipManagerError` listener, the room
  sanity check, `ReactionsReader`, `mediaKeyStatisticsOf`) is skipped.
  `ActiveCall`/`InCallView` take `roomId` instead of `matrixRoom`, and
  `client`/`rtcSession` optionally. `ProfileSettingsTab` edits through the
  client driver's optional `setDisplayName`/`setAvatar(file | null)` and
  shows read-only fields without them; `DeveloperSettingsTab` reads the
  sticky probe from `getMatrixClientFeatures()`, the crypto version from
  `getDiagnostics()` and validates a custom LiveKit URL through
  `rtcDriver.getLivekitToken` when there is no client; the rageshake request
  event goes through the client driver's timeline; reactions are supported
  unless a client state forbids them. `ElementCall` renders no
  `ClientProvider` and no shim — it hands its two drivers down and nothing
  below asks for a client; `initializeElementCall(config, { matrixRtcWasm })`
  can preload the wasm. `PosthogEvents.eventCallEnded.track` takes
  `MediaKeyStatistics` (from the session on the js-sdk path, zero on the
  crate path until the crate counts). `useTypedEventEmitter` and the js-sdk
  client driver's public `client`/`room` are gone. **Consequence:** the
  component and its dev harness (`ElementCallClientBased`) now run every
  call on the crate.
- **Banner dropped (2026-09-17):** the disconnected banner, its
  `useHomeserverConnected` hook and the client state's `disconnected` flag
  are gone. The local membership already carries the connection state, so
  the reconnecting overlay covers the in-call case where it matters; in the
  lobby the banner added little. `HomeserverConnected` in
  `state/CallViewModel/localMember/` remains the one consumer of
  `rtcDriver.isHomeserverConnected()` / `subscribeConnectivity` and of
  `sync_disconnect_grace_period_ms`. The mock RTC driver keeps several
  connectivity sinks (the crate's and the UI's).
- **S4 closed (2026-09-16):** `CallView.stories.tsx` (Lobby with a peer,
  NoTransport as the error path, Ended) over the mock drivers, no client;
  `.storybook/preview.tsx` initialises the config; the Storybook vitest
  project passes. The Playwright switch is `CALL_VIEW_MODEL_IMPLEMENTATION`
  read by `playwright.config.ts` into `use.storageState` (the developer
  setting in local storage for every context), and the CI Playwright job is
  a matrix over both implementations (`matrix-rtc` non-blocking until it
  has passed once). `RtcParticipationManager.mediaKeyStatistics()` counts sent
  and received keys and their age from the crate's key changes for the
  ended-call event. Found on the way: `CallView` rendered `ActiveCall`
  before the participation existed (wasm loads on first use) — it now waits;
  and `onLeft` had gained the member count as a dependency, which rebuilt
  the view model on every roster change on both paths — read through
  `useLatest` now. `create-call.spec.ts` passes in Chromium on both
  implementations with two view model creations each (StrictMode): the
  crate path's first full call in a browser.

### S5 — hosts ☐ (component props done 2026-09-15)

- **Done:** `ElementCallProps` takes `rtcDriver` + `clientDriver` (`roomId`
  optional, asserted equal); `ElementCallClientBased` takes `client` +
  `roomId` and builds the two js-sdk drivers (the dev harness uses it); the
  driver types and the js-sdk drivers are exported from the component index.
  **Temporary:** until S4 the tree under `CallView` still runs on the
  client, so `ElementCall` requires the client driver to be
  `JsSdkElementCallMatrixClientDriver` (its `client`/`room` are public for
  this) and throws for any other driver.
- `component/matrix-js-sdk.ts`, `component/package.json`
  (`exports`, peers), `vite-component.config.ts` (two entries, `fileName`
  function, externals shrink, `?url&no-inline`), `component/tsconfig.build.json`,
  `component/dev/Harness.tsx`, `README.md`.
- `src/room/useLoadGroupCall.ts`, `RoomPage.tsx`, `src/widget.ts`
  (capabilities, §4.5), `sdk/main.ts`, `playwright/spa-helpers.ts`
  (delegation route helper), `docs/` config notes.
- Gate: all four builds; Playwright standalone + widget + component against
  `pnpm backend`; a widget media-key round trip and `reconnect.spec.ts`
  re-checked under the new delegation path.

### S6 — fence and cleanup ☐

- `src/utils/logger.ts`; local `CallIntent` type for the six `RTCCallIntent`
  users; `useLocalStorage.ts` on a local emitter; oxlint
  `no-restricted-imports` scoped to the call tree (allow-list: `src/home`,
  `src/auth`, `src/utils/spa.ts`, `src/utils/matrix.ts`, `src/driver/jsSdk/**`,
  `src/ClientContext.tsx`, `src/widget.ts`, `src/initializer.tsx`,
  `src/IndexedDBWorker.ts`, `src/room/KnockLobbyView.tsx`, `src/settings/rageshake.ts`)
  banning `matrix-js-sdk` except `matrix-js-sdk/lib/logger`.
- `ServiceInterruptionsViewModel` fed from `status$.impairments`.
- `callViewModelImplementation` setting, its `config.json` pin and the
  Developer Settings control removed with `createJsClientCallViewModel$`
  (§5.15); Playwright runs the suite once again.
- `docs/agents/architecture.md`, `docs/matrix_rtc_modes.md` updated;
  `src/@types/matrix-js-sdk.d.ts` removed if nothing merges into js-sdk types.

---

## 7. Risks and mitigations

| Risk                                                                           | Mitigation                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| A user without the power level to open a slot, in a room that never had a call | `NoOpenSlotError` names the remedy; a room admin opens the slot by starting the first call |
| A client on the removed sticky dialect (none is deployed)                      | Not supported: `Off` and `StateEvents` are the only dialects (C9)                          |
| Component bundle size / wasm delivery                                          | `?url&no-inline` + `exports` wildcard + `matrixRtcWasm` override; verified in S0b and S5   |
| Token refresh vs LiveKit reconnect                                             | `Connection.token$`; full reconnect uses the latest token; `expiresAtTs` logged            |
| Own identity before the echo                                                   | C6 export; JWT `sub` only as a logged cross-check                                          |
| Keys before identity                                                           | key provider buffers per member id and replays                                             |
| Widget mode regressions (origins, to-device event, capabilities)               | S1b tests against a `RoomWidgetClient` fake; S5 widget e2e adds a media-key round trip     |
| Delegation fails after the long leave was armed                                | Arm-after-confirm (C5): the short leave stays armed until delegation is confirmed          |
| Behaviour drift in keep-alive (6 s vs 4 s restarts) and dropped config keys    | documented in `docs/`                                                                      |
| Test time: wasm per file                                                       | lazy boot in the suites that need it only                                                  |

---

## 8. Verification matrix

| Check                                                                        | S0a | S0b | S1  | S2  | S3  | S4  | S5  | S6  |
| ---------------------------------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cargo test/clippy`, `web-test-app` suites                                   | ●   |     |     |     |     |     |     |     |
| `pnpm lint` + `format:check`                                                 |     | ●   | ●   | ●   | ●   | ●   | ●   | ●   |
| `pnpm test:unit`                                                             |     | ●   | ●   | ●   | ●   | ●   | ●   | ●   |
| `pnpm test:storybook`                                                        |     |     |     |     |     | ●   | ●   | ●   |
| four builds                                                                  |     | ●   |     |     |     |     | ●   | ●   |
| Playwright standalone + widget + component                                   |     |     |     |     |     |     | ●   | ●   |
| Manual: two harness panes hear each other, E2EE, hand raise, reaction, leave |     |     |     |     |     |     | ●   |     |
| Real backend (`RtcParticipationManager.backend.test.ts`, opt-in, both modes)       |     |     |     | ●   |     |     | ●   |     |

---

## 9. Open questions for the user (answered by the assumptions in §5 until told otherwise)

1. Slot semantics, **answered**: no slot means no call; Element Call opens the
   slot on the first call in a room, power level permitting.
2. Delegation, **answered**: CS API endpoint first, then Element Call's
   OpenID → JWT → scheduled-event path, all inside the crate and invisible to
   Element Call (C5).
3. Media-key type under the sticky compat, **answered**: there are no deployed
   sticky-event clients, so the compat mode is removed (C9) and the question
   with it.
4. MSC4153, **answered**: off everywhere for now, with a TODO to turn it on
   and C10 so tiles show unverified senders in the meantime.
5. Reactions relation target: current membership event id (taken), stable join
   event id, or `memberId`?
6. Committing the 6.5 MB wasm (taken) vs a build-time fetch.
7. `roomId` prop: optional for one release (taken) vs removed outright.
8. `updateCallIntent`, **answered**: added to the crate as `update_application`
   (C11); Element Call keeps the behaviour.

---

## 10. Review log

Independent review findings incorporated in this revision: slot enforcement
blocker (C1); delegation protocol and 1 h arm (C5, §5.9; later redefined as crate-only with arm-after-confirm); `StickyEvents` key
type interop (C3, then made moot by removing the mode, C9); MSC4153 default (§5.8); widget-client differences for the
js-sdk drivers (§4.6) and missing widget capabilities (§4.5); own identity
export (C6); `RtcParticipationManager` lifetime at `CallView` (§4.2); notification
timing and content (§4.3); reactions/event-id semantics (§5.7); config mapping
defaults and dropped keys (§4.3); `bigint`/`ArrayBuffer` types; inventory
gaps (§2); knip `ignore` vs `ignoreFiles`, oxlint/oxfmt ignores, `.d.ts` for
the glue, lazy wasm boot, Storybook `beforeAll`; slice re-cut (S0a/b, S1a/b,
S3a–d, S4a/b, temporary `CallView` shim); `sdk/main.ts` status wiring and the
Playwright delegation helper.

**Real-backend check (2026-09-15), `pnpm backend` + `src/state/rtc/RtcParticipationManager.backend.test.ts`**
(`MATRIX_RTC_BACKEND=1 NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm vitest run --project unit src/state/rtc/RtcParticipationManager.backend.test.ts`;
two registered users with rust crypto in an encrypted room, `matrix_2_0` and
`compatibility`): passes end to end — transport discovery from
`/rtc/transports`, slot open + echo, sticky member event with `msc4354_sticky`,
delayed leave, delegation via the homeserver, roster with display names,
Olm-encrypted media keys both ways with `senderCrossSigned`, leave cancelling
the delayed event, and `HomeserverUnreachable` raised and cleared across a
simulated network outage. Fixed on the way: MSC4195 `member` claims and the
homeserver route's body (`url`, `delay_timeout`; C5), the missing session
listener (C13), the legacy slot id under compatibility mode (§5.13). Noted:
`vite-plugin-node-polyfills` shadows `process`, so tests read the environment
through `node:process`; Synapse develop already proxies the MSC4195 endpoint
to lk-jwt-service; member events are Megolm-encrypted in encrypted rooms
(§5.14). Not verified here: the widget host path (Element Web) and the
authorisation-service route (the homeserver route is taken first on this
stack; it is covered by unit tests only).

**S3 (2026-09-15):** the driver-based `createCallViewModel$` landed next to
the renamed `createJsClientCallViewModel$` (shared `assembleCallViewModel`,
neutral `CallMember`/`DeclineEvent`, `LocalMedia.ts` extracted); component
props moved to the two drivers with `ElementCallClientBased` on top. Gates:
`pnpm lint`, `format:check`, `test:unit` (803), `i18n:check`,
`build:component` green. Open from this slice: reactions reader on the
participation (S4b), the `?url&no-inline` wasm asset for the component build
(the wasm is loaded lazily and inlined into the component bundle today), and
the S6 deletions.

**S4 (2026-09-16):** the implementation switch (§5.15) is in with its
config pin, developer control and rageshake field; `CallView` owns a
`RtcParticipationManager` when the crate path is selected and `ActiveCall` builds
the matching view model; the reactions reader and sender have participation
and driver counterparts. Both paths run in the same build. Gates: `pnpm
lint`, `format:check`, `i18n:check`, `test:unit` (815), `build:component`
green. Not verified: a real call on the crate path through the UI (the
`pnpm backend` check covers the view model's Matrix side; the browser run is
the S5 gate).

**Logging (2026-09-16):** C14 — the crate's log lines reach the host through
a `LogSink`; Element Call routes them to its rageshake logger under
`[matrix-rtc]`, the web-test-app to the console. Verified by a unit test that
sees the crate's "session created" line through the sink.

**S4 views (2026-09-16):** room info, own profile, encryption system,
avatars, the invite and ended views and the rageshake fields read the
drivers; `CallView` requires drivers. Three room hooks deleted. Gates:
`pnpm lint`, `format:check`, `test:unit` (819), `build:component` green.

**Client-free component (2026-09-16):** `CallView` and everything under it
run without a matrix-js-sdk client on the crate path; the component passes
only its drivers. Gates: `pnpm lint`, `format:check`, `test:unit` (819),
`build:component` green. Not yet done: a browser run of the component on
the crate path (the dev harness now is that run).

**S4 done (2026-09-16):** stories, Playwright switch and CI matrix, key
statistics. `create-call.spec.ts` green on `matrix-js-sdk` and `matrix-rtc`
in Chromium against the dev server; the rest of the suite under
`matrix-rtc` is the S5 gate. Gates: `pnpm lint`, `format:check`,
`test:unit` (822), `test:storybook` (28), `build:component` green.
