# Architecture

## Logic lives in view models; components render

- Call logic lives in `src/state/`. A component that derives call state is
  misplaced logic.
- Composing behaviors: a factory taking `(scope, ...deps$)`, returning named
  behaviors plus callbacks. Copy `src/state/LayoutSwitchViewModel.ts`. Prefer this
  for anything new.
- Owning a resource: a class taking the scope in its constructor — `MediaDevices`,
  `MuteStates`, `TileStore`, `Publisher`, `Connection`. Both styles are current;
  don't convert one to the other in passing.
- `foo$` is an observable. `Behavior<T>`, an observable with a current value, is
  the default for anything a view reads.

## The view model / view contract

- Components take `vm: ViewModel<Snapshot>` and read state through `useBehavior`.
  See `CallFooter`, `InCallView`, `LobbyView`, `SettingsModal`.
- A snapshot is `Actions & State`; every field becomes a `foo$` behavior, and none
  is optional.
- An unavailable action is `undefined`, not a separate `canDoThing` flag — the
  presence of the callback drives the rendering.
- Subscribe in an effect only to drive a side effect off an event stream, as
  `ReactionAudioRenderer` does; never to read state a behavior already holds.

## Scopes own lifetimes

- `ObservableScope` bounds every subscription a view model creates.
- Reference only the scope defined in the same function; one captured from an
  enclosing scope outlives its owner, and `no-observablescope-leak` rejects it.

## Nothing reads the page

Element Call can be mounted several times inside a host's React tree, so it owns
neither window, URL, document nor router. Each seam defaults to the old standalone
and widget behaviour.

| Never                                         | Use                                                           |
| --------------------------------------------- | ------------------------------------------------------------- |
| the `widget` global                           | `useHostBridge()` — `src/HostBridge.ts`                       |
| `getUrlParams()`, `window.location`           | `useUrlParams()`                                              |
| `useNavigate("/")`, `<Link to="/">`           | `useLeaveToHome()`, `LeaveToHomeLink`                         |
| `document.body`                               | `useRootElement()`                                            |
| `window.innerWidth/Height`, `useMediaQuery`   | `useRootSizeMatches()` in views, `windowSize$` in view models |
| global `i18next`                              | the instance in `src/utils/i18n.ts`                           |
| config or analytics reading their environment | `Config.initWith()`, `PosthogAnalytics.configure()`           |

- View models take values as options, never `getUrlParams()`
  (`callViewModelOptionsFromParams`, `CallViewModelOptions.hostBridge`).
- The host bridge is the only channel to the host: `createWidgetHostBridge(widget)`,
  `nullHostBridge` standalone, `useComponentHostBridge`. State a capability
  (`supportsReactions`, `supportsProfileChanges`); never infer it from being a
  widget.
- Shortcuts and portals attach to the root element, so two instances don't fight.
- Known debt, not precedent: `Grid` measures `window.innerHeight`; `ErrorView`'s
  reload and `getAbsoluteRoomUrl` use `window.location`; recaptcha appends to
  `document.body` on the standalone login path.

## Context differences are options, not checks

- Named options with per-intent defaults (`configurationForIntent`), never a
  runtime check for who is hosting.
- `controlledAudioDevices`, not the platform, is what makes `MediaDevices` pick
  `AndroidControlledAudioOutput` / `IOSControlledAudioOutput` over the web
  `AudioOutput`. Intent presets set it on non-desktop; standalone leaves it off.
- URL params are a published contract: change one, update `docs/url_params.md`.

## Build targets

Code that builds in only one is a bug.

- `build:full` — standalone app, also widget mode.
- `build:embedded` — `@element-hq/element-call-embedded`.
- `build:sdk` — SDK library, entry `sdk/main.ts`.
- `build:component` — `@element-hq/element-call-component`, sources in `component/`
  (its own pnpm project; run pnpm from the repo root). Host API is in the README;
  `pnpm lint:externals` rejects an import of a `react` / `react-dom` /
  `matrix-js-sdk` / `livekit-client` subpath the externals list omits.
