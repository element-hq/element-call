# Testing

Three layers; a user-facing feature needs all three. Unit proves the logic,
Storybook proves the rendering, e2e proves the feature. Codecov gates 80% on the
lines a PR touches.

## Unit

- View model tests use `withTestScheduler` + `testScope()` from `src/utils/test.ts`
  and read as ASCII timelines. Copy `LayoutSwitchViewModel.test.ts`.
- Component tests use Testing Library, queried by role and accessible name.
- Reuse the factories in `src/utils/test.ts` — `mockRemoteParticipant`,
  `mockMatrixRoom`, `mockLivekitRoom`, `MockRTCSession`. Hand-rolled mocks drift.
- Snapshots live in `__snapshots__/`; update with `pnpm test <Name> -u`.
- How often something redraws is testable: drive the frames and count commits, not
  render calls. An effect with no dependency array runs once per commit.
- `component/**/*.test.ts` runs in the same jsdom project as `src`.

## Storybook

A deliverable, not documentation: `pnpm test:storybook` runs every story as a real
browser test in the same CI job as the unit suite. **A UI change without a story is
incomplete.** Only three stories exist so far, so copy `CallFooter.stories.tsx`.

- Drive the component from a snapshot via `useStaticViewModel`, never internals.
- One named story per state that matters — loading, error, empty, denied, mobile.
- Assert in a `play` function with `userEvent` / `expect` from `storybook/test`.
- Mobile is `globals: { viewport: { value: "mobile2" } }`, not a second component.
- Expose interesting props through `argTypes`.

`.storybook/preview.tsx` supplies `TooltipProvider`, `src/index.css` and English
translations. The browser is Playwright's, so a fresh clone needs
`pnpm playwright install` once.

## End-to-end

- `playwright/*.spec.ts` — standalone, on Chromium and Firefox.
- `playwright/widget/` — widget mode, where cross-context bugs surface.
- `playwright/component/` — the component in a host page, via the harness on port
  3001 that Playwright starts as a second web server. Catches container-relative
  layout, styles escaping the root, two instances on a page, host-bridge reports.
- `playwright/mobile/` — Pixel 7, `mobile` project only.

Test what a user observes: the peer sees the change, it survives a reconnect, it is
right after a reload. Reuse `playwright/spa-helpers.ts`,
`playwright/widget/test-helpers.ts`, `playwright/fixtures/`.

```sh
pnpm test                   # unit + storybook
pnpm backend                # Synapse + LiveKit, required for e2e
pnpm test:playwright        # or :open
pnpm dev:component          # component harness, port 3001
```
