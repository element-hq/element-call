# Merging PR #4331 onto the SDK / Element Call split

How [element-hq/element-call#4331](https://github.com/element-hq/element-call/pull/4331)
("LiveKit updates": MSC4195 client-server API tokens, `url` transports, delegation
through the homeserver, a transport dev override) lands on `toger5/use-sdk`, where
the MatrixRTC logic lives in `sdk/` and Element Call consumes it through
`sdk/src/api.ts`. The PR was written against `main`, where all of this still sat
in `src/state/CallViewModel/`. This document goes through the PR commit by commit,
says whether each one lands in `sdk/` or `src/`, and how; the section
[Changes to `api.ts`](#changes-to-apits) covers the public interface in full. The
end state: this branch behaves exactly as the PR does, with the split and the
`api.ts` seam intact.

The PR's branch is checked out at `agent-workspace/pr4331-merge/worktree` for
comparison. The `matrix-js-sdk` dependency is pinned to the same `develop`
commit the PR uses (`4df2f2bf`, 43.0.0), which brings `UnstableLivekitTransport`,
`CallMembership.backendIdentities`, `_unstable_getLivekitToken` and
`_unstable_delegateDelayedLeave`. That bump also renamed
`MatrixRTCSession.leaveRoomSession` to `leave`, which the SDK now calls.

## Where each commit lands

| #   | Commit                                                                    | Lands in      | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Remove stray pause and improve logging for hung e2e tests                 | e2e           | Applied as is: `playwright.config.ts`, `playwright/widget/federated-call.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | Fix typo in the name of the createJWTToken Playwright fixture             | e2e           | Applied as is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | Advertise the loopback address from the dev LiveKit SFUs                  | backend       | Applied as is: `backend/dev_livekit*.yaml`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4   | Match LiveKit participants against all backend identities                 | sdk           | `RTCMember.backendIdentities` (new, see api.ts). `LivekitBackend.mediaFor` matches `member.backendIdentities.includes(p.identity)`; `RTCParticipation.data$` maps a packet's sender the same way. `mockRtcMembership` in both `sdk/src/utils/test.ts` and `src/utils/test.ts` takes the new 4-argument constructor and a `backendIdentities` override.                                                                                                                            |
| 5   | Model ConnectionState as a discriminated union                            | sdk           | `Connection.ts` state is `{state: "initialized" \| "authenticating" \| "authenticated" (+ `livekitState`) \| "error" (+ `error`) \| "stopped"}`. Internal to the LiveKit backend: `connectionState.ts` maps it onto the backend-neutral `MediaConnectionState`, so nothing above the backend changes. `DataChannel.ts` and `ConnectionFactory.ts` follow.                                                                                                                         |
| 6   | Show the whole transport in debug UI and logs                             | sdk + src     | SDK log lines use `JSON.stringify(transport)`. Element Call: `focusUrl$: Behavior<string>` on the member media view models becomes `transport$: Behavior<Transport>` (`TransportMetadata.raw`), carried through `GridTile`, `SpotlightTile`, `MediaView` to `RTCConnectionStats`, which prints the JSON. The old code showed `extractDomain(transport.id)`, which on this branch was already a JSON string, so this also fixes a latent bug.                                      |
| 7   | Group livekitRoomItems$ by connection                                     | n/a           | `livekitRoomItems$` and `LivekitRoomAudioRenderer` do not exist on this branch: audio renders from `tracks$` (`MemberAudioRenderer`). Nothing to port.                                                                                                                                                                                                                                                                                                                            |
| 8   | Move SFU authentication into livekit/auth and choose the endpoint by role | sdk           | `sdk/src/media-backend/livekit/auth/{index,openID,csApi,types}.ts` replace `openIDSFU.ts`. Publisher → legacy `/sfu/get`; subscriber → `/get_token`. `slotId` replaces the hard-coded `m.call#ROOM`: `MediaBackendContext.slotId`, taken from the js-sdk session in `RTCParticipation`. The `tokenEndpoint` option of `createLivekitBackend` and the derivation from `MatrixRTCMode` are gone.                                                                                    |
| 9   | Let the publishing Connection authenticate itself                         | sdk           | Every `Connection` has a `role` and fetches its own token; `existingSFUConfig` is gone. `prepareLocalTransport` no longer fetches a token itself: it starts the publisher connection (through the connection map) and resolves once that connection reports `authenticated`, rejecting with its error otherwise. Since `LocalMembership` joins only after `preparedTransport$` resolves, the join waits for the publisher's token exactly as the PR's `authenticated$` gate does. |
| 10  | Reduce ConnectionManager to a ConnectionMap                               | sdk           | `ConnectionMap.ts` replaces `ConnectionManager.ts`; `createConnectionMap$` takes a resolved local transport, and `LivekitBackend` wraps it in `mapScoped` over the local transport, as the PR's `CallViewModel` did. `LocalMedia.ts`, `DataChannel.ts` take `connectionMap$`.                                                                                                                                                                                                     |
| 11  | Use the unstable LiveKit transport type                                   | sdk + src     | `UnstableLivekitTransport` / `isUnstableLivekitTransport` throughout the backend; `src/settings/settings.ts`, `DeveloperSettingsTab`, test helpers. Transport discovery in `sdk/src/matrixrtc/` is now backend neutral (filters by `type`, see commit 15).                                                                                                                                                                                                                        |
| 12  | Identify transports by server name as well as URLs                        | sdk           | `TransportLocator {transport, serverName}` in `auth/types.ts`; `ConnectionMap.keyFor` keys on `(url, livekit_service_url, serverName)`. The server name is derived from the user id (`serverNameOf`) for remote members and from our own membership identity for the local transport, so neither `api.ts` nor the backend options need it.                                                                                                                                        |
| 13  | Pin matrix-js-sdk to the member_id branch                                 | superseded    | By commit 19; the lockfile pins the PR's final `develop` commit.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 14  | Get SFU tokens and delegate delayed leaves through the MSC4195 CS API     | sdk           | `auth/csApi.ts` (`_unstable_getLivekitToken`, `_unstable_delegateDelayedLeave`), `auth/index.ts` facade with the fallback rules. `LivekitBackend.delegateDelayedLeave` goes through the facade; the delegation probe asks only the service the publisher flow uses. `LivekitBackendOptions.client` picks the two new client methods.                                                                                                                                              |
| 15  | Let developers override the whole transport                               | sdk + src     | `RTCParticipationOptions.transport` / `fallbackTransport` take a `Transport` instead of `transportUrl` / `fallbackTransportUrl` (see api.ts). Element Call: setting `custom-transport` (JSON) replaces `custom-livekit-url`; `DeveloperSettingsTab` edits JSON and validates through `authenticateWithTransport`; `InCallView` turns `config.livekit.livekit_service_url` into the fallback transport. Locale keys `developer_mode.custom_transport.*`.                           |
| 16  | Deprecate the livekit.livekit_service_url config option                   | src           | Applied as is in `ConfigOptions.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 17  | Cover url transports end to end                                           | e2e + backend | `playwright/url-transport.spec.ts`, `backend/app-service*.yaml`, `docker-compose-dev.yml` (lk-jwt-service 0.8.0) copied as is.                                                                                                                                                                                                                                                                                                                                                    |
| 18  | Retain compatibility in compatibility mode                                | superseded    | Reverted by commit 23 inside the PR; only its e2e spec edits survive, in the final spec file.                                                                                                                                                                                                                                                                                                                                                                                     |
| 19  | Switch JS SDK back to develop                                             | deps          | `pnpm-lock.yaml` pins `4df2f2bf` and `matrix-widget-api` 1.20.0; `package.json` keeps `#develop`.                                                                                                                                                                                                                                                                                                                                                                                 |
| 20  | Fall back to get_token as subscriber on widget API errors                 | sdk           | `isCsApiUnavailable` in `auth/index.ts`; `doNetworkOperationWithRetry(op, shouldRetry)` in `sdk/src/utils/network.ts` with `isNetworkError` in `csApi.ts`.                                                                                                                                                                                                                                                                                                                        |
| 21  | Share a connection between homeservers using the same JWT service         | sdk           | `keyFor` ignores the server name for transports without a `url`; `removeDuplicateTransports` keeps the first locator so the local one wins.                                                                                                                                                                                                                                                                                                                                       |
| 22  | Avoid null in transport dev setting                                       | src           | `transportText()` in `DeveloperSettingsTab.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 23  | Make the auth choice mode independent again                               | sdk           | `chooseAuthFlow(transport, role)` has no mode parameter; `config.ts` documents that `MatrixRTCMode` decides how the membership is written, not how the transport is authenticated.                                                                                                                                                                                                                                                                                                |
| 24  | Cover identity matching and delegation across transport shapes            | sdk + e2e     | Unit tests in `LivekitBackend.test.ts` (see below); `playwright/url-transport.spec.ts` final version.                                                                                                                                                                                                                                                                                                                                                                             |
| 25  | Cover the subscriber token path, widget fallback and server names         | sdk + e2e     | `auth/openID.test.ts` subscriber cases; `playwright/widget/url-transport.test.ts`; the server-name test lives in `LivekitBackend.test.ts` ("connects to a remote member's transport on the member's homeserver").                                                                                                                                                                                                                                                                 |

## Changes to `api.ts`

Three changes to the public SDK interface, all forced by the PR's behaviour.

### `RTCMember.backendIdentities` (new)

```ts
/** The membership's `rtcBackendIdentity`, `${userId}:${deviceId}`: a key and a debug label. */
rtcBackendIdentity: string;
/**
 * Every identity the member may publish under on its transport: the
 * participant identity the SFU sees, and the sender of its data packets.
 * One per authentication flow the member's transport allows, so a transport
 * with both a `url` and a `livekit_service_url` lists the hashed and the
 * legacy identity, and the backend matches whichever shows up.
 */
backendIdentities: readonly string[];
```

Commit 4 of the PR. A member on a transport that carries both a `url` and a
`livekit_service_url` may have authenticated through either flow and so has
two candidate identities; the js-sdk now lists them on the membership. The
backend matches media and data packets against the list.
`rtcBackendIdentity` stays as the stable per-membership key Element Call uses
for tile ids and the debug overlay, and its doc says that it is no longer
what the backend matches on. Read off the membership, like the single identity
before it; the backend will derive both once the identity scheme is its own.

### `RTCParticipationOptions.transport` / `fallbackTransport` replace the url options

```ts
/**
 * Use this transport instead of asking the homeserver. Any shape the
 * backend serves: for LiveKit a `url`, a `livekit_service_url` or both.
 */
transport?: Transport;
/** Use this transport when the homeserver advertises none of the backend's type. */
fallbackTransport?: Transport;
```

Commit 15 of the PR. The developer override has to carry a whole transport so
that a `url`-only or combined shape can be tested against a homeserver that
does not advertise one yet; a URL cannot say which shape it is. This also
removes the one piece of LiveKit knowledge that sat outside the backend:
`LocalTransport.ts` and `TransportAutoDiscovery.ts` no longer build a
`{type: "livekit", livekit_service_url}` object and filter by `transportType`
only, which `LocalTransport.ts` had marked as the moment to do this. The
host turns its config URL into a transport (`InCallView.rtcParticipationOptions`).

### `TransportMetadata` is unchanged, with one documented limit

`TransportMetadata.id` is still the raw transport serialised with sorted keys.
The LiveKit backend now keys its connections on the transport plus the server
name where the transport has a `url` (commits 12 and 21), so two homeservers
advertising the same `url` get two connections but one `TransportMetadata`.
`connectedTransports$` deduplicates, and `resolved$` reports the first
connection's resolution. This is diagnostics only; the media and data paths
go through the backend's own keys. Extending `TransportMetadata` with the
server name was left out to keep the type transport neutral; a developer panel
that needs it can be given a `serverName` on `BackendConnection` later.

### Related, outside `api.ts`

- `media-backend/api.ts`: `MediaBackendContext.slotId` (commit 8). The
  client-server API issues a token for a slot, so the backend needs it;
  `RTCParticipation` reads it from the js-sdk session.
- `sdk/index.ts`: `authenticateWithTransport` is now the auth facade's
  `getSFUConfig({client, membership, transport, serverName, roomId, slotId, role, logger})`
  (object parameter, whole transport, server name); `AuthenticateWithTransportParams`
  is exported for it; `TokenEndpoint` is gone.
- `createLivekitBackend` options: `tokenEndpoint` is gone; `client` now picks
  `_unstable_getLivekitToken` and `_unstable_delegateDelayedLeave` as well.
- `config.ts`: the `MatrixRTCMode` doc no longer claims the mode picks the
  JWT endpoint (commit 23).

## Behaviour, side by side

| Behaviour                              | PR on `main`                                                                                | This branch                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Endpoint choice                        | `chooseAuthFlow` in `src/livekit/auth`                                                      | Same function, `sdk/src/media-backend/livekit/auth/index.ts`                                                                |
| Join waits for the publisher's token   | `authenticated$` gate in `LocalMember.ts`                                                   | `prepareLocalTransport` resolves on the publisher connection's `authenticated` state; `LocalMembership` joins after it      |
| Delegation probe                       | The flow's service only, in `LocalMember.joinParams$`                                       | The flow's service only, in `prepareLocalTransport`                                                                         |
| Delegation handover                    | `delegateDelayedLeave` facade from `LocalMember`                                            | Same facade from `LivekitBackend.delegateDelayedLeave`, with the delay timeout from the session timings instead of `Config` |
| Transport keys and connection sharing  | `ConnectionMap.keyFor` on `TransportLocator`                                                | Same, moved                                                                                                                 |
| Server names                           | `membershipsAndTransports$` from the user id; `getLocalTransport` from `client.getDomain()` | `serverNameOf(userId)` for members; our own membership identity's user id for the local transport                           |
| Identity matching                      | `membership.backendIdentities.includes(p.identity)`                                         | `member.backendIdentities.includes(p.identity)` in `mediaFor` and for data packets                                          |
| Dev transport override                 | `customTransport` setting → `getLocalTransport`                                             | `customTransport` setting → `RTCParticipationOptions.transport`                                                             |
| Config fallback                        | `RtcTransportAutoDiscovery.tryConfigTransport`                                              | Host builds the transport, `RTCParticipationOptions.fallbackTransport`                                                      |
| Error for a `url` host without MSC4195 | `NoMatrix2AuthorizationService` from the publisher connection                               | Same error, surfaced through `prepareLocalTransport` → `state$ failed` → `fromMatrixRTCError`                               |

One deliberate difference: on `main` the publisher connection fetches its token
on every (re)creation and nothing else does; here it is the same, since the
up-front token fetch in `prepareLocalTransport` is gone. There is no second
token request per join.

## Where the PR's new tests went

| PR test                                                                               | Here                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/livekit/auth/index.test.ts`                                                      | `sdk/src/media-backend/livekit/auth/index.test.ts`. Rewritten on the network layer (fetch-mock for the JWT service, mocked client methods) because a `vi.mock` of the sibling `openID` module does not reach the facade's own import under `sdk/`. Same cases, plus a table for `chooseAuthFlow`.    |
| `src/livekit/auth/openID.test.ts`                                                     | `sdk/src/media-backend/livekit/auth/openID.test.ts`, replacing `openIDSFU.test.ts`                                                                                                                                                                                                                   |
| `ConnectionMap.test.ts` (incl. commit 21's sharing tests)                             | `sdk/src/media-backend/livekit/ConnectionMap.test.ts`, replacing `ConnectionManager.test.ts`; plus a role-tagging test                                                                                                                                                                               |
| `Connection.test.ts` changes                                                          | `sdk/src/media-backend/livekit/Connection.test.ts`; plus a publisher-through-the-JWT-service case                                                                                                                                                                                                    |
| `LocalMember.test.ts` "joins session with %s delegation support" (by transport shape) | `LivekitBackend.test.ts` "prepares the local transport and asks %s about delegation", "waits for the publisher connection to hold its token before the join", "fails the preparation with the publisher connection's error", "delegates the leave through the flow that authenticated the publisher" |
| `MatrixLivekitMembers.test.ts` two-candidate-identity tests                           | `LivekitBackend.test.ts` › `mediaFor`                                                                                                                                                                                                                                                                |
| `SessionBehaviors.test.ts` server-name test                                           | `LivekitBackend.test.ts` "connects to a remote member's transport on the member's homeserver"                                                                                                                                                                                                        |
| `LocalTransport.test.ts` / `RtcTransportAutoDiscovery.test.ts` changes                | `sdk/src/matrixrtc/TransportAutoDiscovery.test.ts` (fallback is a transport)                                                                                                                                                                                                                         |
| `DeveloperSettingsTab.test.tsx` custom transport cases                                | `src/settings/DeveloperSettingsTab.test.tsx`, snapshot updated for the label                                                                                                                                                                                                                         |
| `DataChannel`, `LivekitBackend` registry tests                                        | Adapted to the state union and `TransportLocator`                                                                                                                                                                                                                                                    |
| `playwright/url-transport.spec.ts`, `playwright/widget/url-transport.test.ts`         | Copied as is: they drive the app, which behaves the same                                                                                                                                                                                                                                             |

The PR's `CallViewModel.test.ts`, `CallViewModelTestUtils.ts`, `LocalMember.test.ts`
(the rest) and `MatrixAudioRenderer.test.tsx` edits have no counterpart: those
modules were replaced by the SDK before this merge.

## One fix the e2e run forced

The bumped js-sdk sets `rtcBackendIdentity` to the legacy `${userId}:${deviceId}`
identity for every membership (it is deprecated there; the hashed one now only
appears in `backendIdentities`). On this branch the call view model keyed its
tiles by `[dup, mediaId, rtcBackendIdentity]`, so a device that rejoined after an
improper leave, which has two memberships until the stale one expires, produced
duplicate keys and crashed the host's page with `UNKNOWN_ERROR`
(`spa-call-sticky.spec.ts`, "rejoin after improper leave"). The key is now the
membership's own `memberId`, and `MemberAudioRenderer` and the SDK harness key
by it too. The PR on `main` keyed by the participant object as well and did not
hit this.

## Checked

- `pnpm lint` (tsc, oxlint, knip, externals), `pnpm format:check`, `pnpm i18n:check`.
- `pnpm test`: 112 unit files, 863 tests; 4 storybook files, 45 tests.
- Playwright on Chromium against the local Playwright backend, one worker:
  - `playwright/url-transport.spec.ts`: 10 of 10 pass, including delegation
    through the homeserver and the JWT service, the subscriber fallback, the
    publisher error and the federated token.
  - `playwright/widget/url-transport.test.ts`: passes.
  - The rest of `playwright/*.spec.ts`, `playwright/component`, `playwright/sdk`:
    48 pass, 1 skipped, 1 fails (`reconnect.spec.ts`, which fails on `main`
    locally too because the local JWT service is slower than the spec's wait).
  - `playwright/widget`: 7 of 10 pass, including `federated-call`. `huddle-call`
    fails before any call code runs (the Element Web develop image's room list no
    longer matches the helper's "Open room" selector), and `screen-share` looks
    for `video[data-lk-source="screen_share"]`, an attribute the LiveKit React
    components set and the SDK's plain `<video>` elements do not: a failure of this
    branch that predates the PR.
  - Local environment work needed for that: the othersite JWT service and nginx
    containers had to be recreated from the compose file, two stale containers held
    port 16080, and the widget helper's hard-coded `https://localhost:3000` was
    pointed at 3100 for the run only, since port 3000 is taken on this machine.
- Standalone, widget and component all go through `InCallView.rtcParticipationOptions`
  and the SDK, so the change is the same in all three modes; the widget-specific
  fallback (a host without MSC4533) is in `isCsApiUnavailable`.
