# Agent workflow

## Scratch files live in `agent-workspace/`

Git-ignored. One kebab-case subfolder per task, matching the branch topic:
`agent-workspace/<slug>/`.

| File                        | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `plan.md`                   | The concrete approach — files, symbols, edit order — once direction is confirmed |
| `commit-msg.txt`            | `git commit -F agent-workspace/<slug>/commit-msg.txt`                            |
| `pr-body.md`                | `gh pr create --body-file agent-workspace/<slug>/pr-body.md`                     |
| `implementation-summary.md` | What was built, decisions, trade-offs                                            |
| `NN-prompt.md`              | Raw prompt text, numbered, when worth keeping                                    |

- Nothing here is durable. The folder is ignored, so anything worth keeping is
  promoted into the PR body, a doc, or a feature spec before the task ends.
- Never write scratch files to the repo root. Stray `load_test_summary.md` and
  `config.json_` files are what this folder prevents.
- Start `pr-body.md` from `.github/PULL_REQUEST_TEMPLATE.md` and fill every
  section.
- Commit subjects are plain imperative English. No conventional-commits prefixes.
- A `plan.md` and a feature spec sit at different altitudes; neither replaces the
  other. A spec in `FEATURES_SPEC/` is durable and deliberately abstract —
  behaviour, decisions, acceptance criteria — so the feature can be rebuilt against
  a `main` nobody has seen yet. A plan is one slice of it landing on today's
  `main`: the paths, symbols and edit order the spec's decisions and criteria must
  not name. `FEATURES_SPEC/AGENTS.md` wins wherever the two genuinely overlap.

## Hand off before the quality pass

- Implement the change, run the narrowest check that rules out an obviously broken
  handoff, then stop and ask whether the direction is right.
- Full `pnpm lint`, the whole suite, coverage and benchmarks come after the
  direction is confirmed.
- Wider refactors, extra tests and documentation polish are follow-up work, not
  part of the first handoff.
- If a check is needed before feedback, keep it to the touched code and say why.

## Commit and PR readiness

- Commit once the user confirms direction, or asks for one. Not before.
- Before committing, every gate in [AGENTS.md](../../AGENTS.md#gates) is green and
  the change is covered at the layers [testing.md](./testing.md) asks for. Read the
  diff against [code-style.md](./code-style.md).
- Re-run the whole checklist after any fix. Commit only on green.
- Once a human has started reviewing, fix forward — never force-push a
  regeneration over a review in progress.
