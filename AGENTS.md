# AGENTS.md — Element Call

MatrixRTC (MSC4143) + LiveKit video calling, shipped standalone, as a widget in
Element Web and Element X, as embedded packages, and as a React component in a
host's page. It is the MatrixRTC reference implementation.

## Non-negotiables

- Features and UI changes need a pre-approved issue. No issue, no review.
- Exactly one `PR-*` label per PR. CI enforces it; it drives the changelog.
- New behaviour ships with unit tests, a story if it renders, and an e2e spec if it
  is user-facing. All three.
- Reuse an existing component. If you genuinely cannot, say so in the PR body and
  name what you rejected — never add a new one silently.
- Nothing reads the page. No `window.location`, `document.body`, `window.inner*`,
  `@media`, global `i18next` or the `widget` global — take it from a provider.
- The change works standalone, as a widget and as a component. Say what you checked.
- Every gate below is green before you push.
- Hand off after the first implementation, before the quality pass. Commit when the
  user confirms direction, not before.

## Read before you

| …                                | …                                                          |
| -------------------------------- | ---------------------------------------------------------- |
| start a task of any size         | [docs/agents/workflow.md](docs/agents/workflow.md)         |
| touch call logic or a view model | [docs/agents/architecture.md](docs/agents/architecture.md) |
| write any code                   | [docs/agents/code-style.md](docs/agents/code-style.md)     |
| write a test, story or e2e spec  | [docs/agents/testing.md](docs/agents/testing.md)           |
| open a PR                        | [CONTRIBUTING.md](CONTRIBUTING.md)                         |
| implement from a feature spec    | [FEATURES_SPEC/AGENTS.md](FEATURES_SPEC/AGENTS.md)         |

## Gates

```sh
pnpm lint            # tsc, oxlint, knip, component externals
pnpm format          # oxfmt
pnpm test            # vitest: unit and storybook projects
pnpm i18n:check
```

`knip` fails on dead code; a file deliberately inert ahead of its consumer goes in
`knip.ts` `ignoreFiles` with a reason.

## A good PR

- One slice, under ~400 changed lines, green on its own, linked to its issue.
- View model + marble tests, thin view, a story per state, an e2e spec.
- Any new shared component called out explicitly, with why nothing existing fit.
- Template filled for real: what, why, before/after screenshots, repro steps.
- Branch `<handle>/<topic>`. Plain imperative commit subjects, no prefixes.
- Once review starts, fix forward. Never force-push a regeneration over a review.
