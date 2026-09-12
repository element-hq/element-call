# FEATURE_SPEC — Agent Instructions

This folder holds **feature specs distilled from experiments**. A spec is the durable
artifact of an exploration; the exploration branch is not. Each spec must contain
enough information for an agent to produce mergeable PRs against a *current* `main`
without access to the original branch.

## What this folder is not

- Not a design-doc archive. Specs that are not intended to be implemented do not
  belong here.
- Not a place for narrative. Prose that does not constrain the implementation or its
  verification should be cut.
- Not a substitute for the PR description. The spec explains *why* and *what must be
  true*; the PR explains *this diff*.

## File naming

`YYYY-MM_Snake_Case_Title.md` — e.g. `2026-09_Raise_Hand_Improvements.md`

The filename is immutable once committed. Renames break links from PRs, issues and
the drift log. If scope changes fundamentally, write a new spec and set
`supersedes:` / `superseded_by:`.

A sidecar `YYYY-MM_Snake_Case_Title.product.md` holds the product spec — user stories,
functional requirements, success criteria. Copy `_TEMPLATE.product.md`. Product owns
it; see "Brainstorming: the product spec".

An optional sidecar `YYYY-MM_Snake_Case_Title.notes.md` holds lessons learned,
narrative, dead-end logs and anything else that is worth keeping but does not
constrain the implementation. Rules:

- The sidecar is **never load-bearing**. Agents do not read it to derive
  implementation, and nothing in it may contradict or extend the spec. If a note
  constrains the work, it belongs in `## Decisions`, `## Rejected alternatives` or
  `## Measurements` instead.
- Agents may append to it (an observation from a drift check, a wrong turn during
  implementation) and must never rewrite or delete existing content.
- An agent that is `blocked` may read the sidecar to draft an open question, but
  quotes what it found rather than acting on it.
- No sidecar is required. An empty one is worse than none.

## Style: facts only

Applies to the spec file only. The product spec is prose by design and the notes
sidecar is unconstrained. The spec is re-read on every regeneration, where prose costs context
and dilutes the contract, so:

- Bullets, not paragraphs. Declarative present tense. No motivation, no background,
  no summary of what the code currently does beyond locating the change.
- Name things instead of describing them — a path, a symbol, an event type, a command,
  an event id. A reference is shorter and more precise than a sentence about it. Which
  kind of reference is allowed depends on the section; see "Reference durability".
- One line per decision plus at most one sentence of rationale. If the rationale needs
  more, the extra goes in the sidecar.
- No judgement adjectives (clean, elegant, proper, obviously) and no hedging (should
  probably, might be nice). Either it is a constraint or it is not in the spec.
- `## Problem` is at most five bullets.
- Target under 200 lines for the whole spec; over 300 lines, split the feature or move
  material to the sidecar.

The test for any line: does it constrain the implementation, constrain its
verification, or record a measured fact? If not, delete it or move it to the sidecar.

## Reference durability

The spec must stay implementable against a `main` nobody has seen yet, so which
references are allowed depends on how fast they rot. Most to least durable:

1. Protocol identifiers — `m.reaction`, `m.call.member`, `m.relates_to`, a reaction
   key. MSC-bound; effectively permanent.
2. Observable behaviour. Permanent.
3. Concept names — membership, participation, session.
4. Test names. Survive file moves and renames, because the test moves with the code.
5. Exported symbols. Survive refactors sometimes.
6. File paths. Rot fast.
7. Line numbers. Never.

Per section:

- `## Problem`, `## Measurements`, `## Slicing plan`, `## Drift log` — any reference,
  paths and internal symbols included. These describe the codebase **as of `base`**. A
  reference going stale here is a finding for the drift check, not a defect, and
  removing the concrete references would leave the drift check with nothing to verify.
- `## Decisions`, `## Acceptance criteria` — levels 1 to 4 only. No file paths, no
  internal symbols. This is the part that has to hold against a future `main`.
- An acceptance criterion that is not user-observable is tagged `[internal]` and
  anchored by **its test name**, not by the symbol under test. The test name moves with
  a refactor; the symbol does not.

`[internal]` ACs are legitimate and expected: an invariant that no current consumer can
observe is exactly what protects the consumer that does not exist yet. Tagging them
keeps visible which ACs defend a product requirement and which defend a code
invariant.

## Required frontmatter

```yaml
---
status: draft            # see state machine below
blocked_from: null       # state to return to when leaving `blocked`
title: Raise hand improvements
owner: <human handle>    # a human, always
signoff:                 # join condition for leaving exploration.signoff
  eng: pending
  design: pending
  product: pending
experiment_ref: <branch name or commit sha of the spike, if any>
base: <sha of main the spec was validated against>
repos: [matrix-js-sdk, element-call]    # in dependency order
specs: [MSC4143]         # protocol documents touched, if any
supersedes: []
superseded_by: null
---
```

`base` is mandatory and is what makes drift detectable. `owner` is a human even when
every section was drafted by an agent.

## Brainstorming: the product spec

The usual entry point is a human handing an agent a one-line feature idea. The output
of that session is `<stem>.product.md`, not code and not a feature spec. Copy
`_TEMPLATE.product.md` and fill it.

Ownership: an agent may create and fill this file during `brainstorm`. From `draft`
onwards **product owns it and agents do not edit it** — not to fix wording, not to
resolve a marker, not to reconcile it with the code. Agents raise mismatches in the
feature spec's `## Open questions`.

If product's source of truth lives outside the repo (a tracker, a design doc), put its
URL in the header `**Source**:` line and keep the requirement text and ids in the repo
anyway. The ids are what the feature spec references; a link alone cannot be traced.

Agent behaviour during the session:

- **Ask, do not assume.** An unanswered question is recorded as
  `[NEEDS CLARIFICATION: <the question>]`, inline where the answer would go. Filling a
  gap with a plausible guess is the main failure mode of this state — the marker is a
  deliverable, not a defect.
- Ask in one round of at most five questions, ordered by how much the answer changes
  the shape of the feature. Do not interview.
- **No implementation in the product spec.** No file paths, symbols, libraries, event
  types, API shapes or framework names. If a requirement cannot be stated without them,
  it is not a product requirement.
- Every user story must be independently deployable and demonstrable on its own. A
  story that only makes sense once another story ships is not a story; merge it.
- More than four priority levels means more than one feature. Split before `draft`.
- Never invent an SC number. Ask for the target, or mark it
  `[NEEDS CLARIFICATION]`.

For protocol and infrastructure work, success criteria may be expressed as observable
client behaviour or a wire-level invariant ("a client joining mid-session converges
within one sync"), but still never as a code path or an internal API.

`FR-###` and `SC-###` ids are immutable once assigned. Product may revise the document
at any time, including after `in_production`, but a changed requirement gets a **new
id** and the old one is marked superseded — never edited in place. Renumbering silently
breaks every AC that references it, and there is no way to detect that afterwards.

A new or changed FR after `implement` does not amend the current spec's scope. It is
either a new feature spec or the next iteration; the mapping table simply shows an
unmapped FR, which is the intended signal.

## Traceability

The product spec states intent; the feature spec states what must be true and how it is
checked. They are kept in sync by ids, not by duplication.

- Every `FR-###` maps to at least one acceptance criterion. Tag the AC with its
  origin: `AC2 [FR-003] — <observable behaviour>`.
- Every `SC-###` maps to an entry in `## Measurements` with a method. An SC with no
  measurement blocks `exploration.signoff`.
- Every user story maps to at least one slice. **Slice order follows story priority**
  (P1 first) unless a technical dependency overrides it, and the override is recorded
  in the slicing plan with its reason.
- An AC with no `FR` origin is allowed and expected — implementation-level invariants
  have no counterpart in the product spec. The converse is not: an unmapped FR is an
  incomplete spec.
- Agents do not resolve a mismatch between the two. The product spec wins on intent,
  the feature spec wins on verification; a genuine contradiction is `blocked`.

## Status state machine

Transitions are explicit; an agent may perform only the ones marked (agent).

```
brainstorm ─► draft ─► exploration ─► implement ─► qa ─► in_production
                           │              │        │
                           └──────────────┴────────┴──► blocked ──► (blocked_from)
                                                           │
                                                           └──► abandoned
```

Exploration has sub-states, written dotted in `status`:

```
exploration.scoping ─► exploration.iterating ─► exploration.signoff
        ▲                       │                      │
        └───────────────────────┴──────────────────────┘
```

- `brainstorm` → `draft`: human. Requires `<stem>.product.md` to exist with at least one
  P1 story carrying acceptance scenarios, every FR and SC id assigned, and every
  remaining `[NEEDS CLARIFICATION]` copied into the feature spec's `## Open questions`.
- `draft` → `exploration.scoping`: human. Requires `## Problem` and `## Out of scope`.
  Scoping before the branch exists is what keeps exploration from becoming the
  long-lived branch this folder replaces.
- `exploration.scoping` → `.iterating`: human. `experiment_ref` must name the branch.
- `.iterating` → `.signoff`: human. Requires `## Decisions`, `## Acceptance criteria`,
  `## Rejected alternatives` and `## Measurements` to be complete, no
  `[NEEDS CLARIFICATION]` left in the product spec, and full traceability (below).
- `.signoff` → `implement`: **only when all three sign-offs in `signoff:` are `ok`.**
  This is a join, not a sequence — a single reviewer cannot advance it. On entering
  `implement`, the exploration branch stops being a base: it is reference material,
  and implementation branches off current `main` (see "Turning a spec into PRs").
- `.signoff` → `.iterating`: human, on any sign-off returning changes. Reset the
  rejecting role to `pending`; leave the others as they are.
- `implement` → `qa`: (agent) when every acceptance criterion is covered, as recorded
  in `## PRs`, and the feature flag is enabled in the QA environment.
- `qa` → `in_production`: human. The flag is on by default in production.
- `qa` → `implement`: (agent) when a QA finding needs code. See "QA feedback".
- any active state → `blocked`: (agent) when drift or an unresolved question prevents
  progress. Requires a drift-log entry and `blocked_from: <state>`. Do not guess and
  continue. Leaving `blocked` returns to `blocked_from`, never to a fixed state.
- any state → `abandoned`: human only.

`in_production` is terminal. A production regression does not reopen the spec: it
either is an ordinary bug fix with no spec, or it is a new spec. The acceptance
criteria remain as the regression contract (see "QA feedback").

## QA feedback

The point of the `qa` state is not to record that testing happened. It is to make the
spec a better regeneration source than it was before implementation. So:

- Every reproduced QA finding becomes **either** a new acceptance criterion **or** a
  new entry in `## Rejected alternatives`. Never a prose note, never only a bug
  tracker link.
- (agent) may **append** ACs during `qa`, with provenance:
  `AC7 [qa: <issue ref>] — <observable behaviour>` plus its check. Appending is
  allowed; rewriting or reordering existing ACs is not.
- A finding that invalidates a decision does not become an AC. It sets `blocked` — a
  decision is human-owned in every state.
- A finding that is out of scope goes to `## Out of scope` with its issue ref, so the
  next regeneration does not treat it as a gap.

This also applies after `in_production`: a production bug that reveals a missing AC is
appended with `[prod: <ref>]` provenance without any state change.

## Required sections

Order matters — agents read top-down and the first three sections are the contract.

1. **`## Problem`** — up to five bullets. What breaks today, for whom, observably,
   with the file or symbol where it breaks.
2. **`## Decisions`** — the choices the exploration settled, each with a one-line
   rationale. **Human-owned. An agent must never add, remove or reword a decision.**
   If a decision is missing, set `blocked` and ask.
3. **`## Acceptance criteria`** — the load-bearing section. Each item must be
   mechanically checkable and name its check:
   - `AC1 [FR-002] — <observable behaviour>` / `check: yarn vitest run src/reactions/ReactionsReader.test.tsx -t "backfill"`
   - `AC2 [FR-002] — <observable behaviour>` / `check: manual, <exact steps>`
   - `AC3 [internal] — <invariant>` / `check: yarn vitest run <file> -t "<test name>"`
   An acceptance criterion without a check is a wish; reject the spec (`blocked`).
4. **`## Rejected alternatives`** — what the experiment tried and why it failed,
   including measurements. This exists so regeneration does not re-walk dead ends. If
   this section is empty for a spec with an `experiment_ref`, the spec is incomplete.
5. **`## Measurements`** — numbers from the experiment with the method used to obtain
   them (command, hardware, load profile). Numbers without a method are not usable as
   regression baselines and must be marked `unverified`. A baseline states its direction: a
   count that unrelated work grows — tests passing, test files — is a floor (`≥ n`); a
   cost — latency, CPU, bundle size — is a ceiling (`≤ n`). An exact count is stale as
   soon as `main` moves and is not a drift finding.
6. **`## Out of scope`** — explicit non-goals, so agents stop expanding the diff.
7. **`## Slicing plan`** — ordered, independently mergeable PRs (see below).
8. **`## Drift log`** — append-only, agent-written.
9. **`## PRs`** — append-only list of `#<n> — <state> — <ACs covered>`.

Optional: `## Open questions` (blocks `exploration.signoff`), `## Migration / compat` (mandatory
whenever wire format, event schema, or a published API changes).

## Turning a spec into PRs

Run these steps in order. Do not skip step 2.

1. **Fetch and pin.** `git fetch origin` and record `origin/main`'s sha as `head`.
   Never start from the exploration branch, and never rebase it — the branch is
   reference material, not a base.
2. **Drift check** against `base..head`:
   - Do all files, symbols and modules named in the spec still exist?
   - Have the invariants in `## Decisions` been contradicted by changes in main?
   - Do the commands in `## Acceptance criteria` still run?
   Write the result as a drift-log entry. On a contradicted decision: set `blocked`,
   do not implement.
3. **Re-derive the slicing plan** if drift changed it. Each slice must:
   - build and pass CI on its own,
   - be reviewable in one sitting (target < 400 changed lines, hard stop at 800 —
     split further rather than exceeding it),
   - map to at least one acceptance criterion, and
   - land behind a flag or be inert if it is not the last slice of a user-visible
     change.
4. **Implement one slice at a time**, branch `spec/<spec-slug>/<n>-<short>` off the
   pinned `head`. Tests for the slice's ACs go in the same PR as the code. A PR merges
   only when every check of every AC it lists passes on that PR: automated checks in
   CI, manual checks performed by a human reviewer with the result recorded in the PR
   description. An AC is *covered* once such a PR has merged.
5. **Open the PR** linking the spec path and listing the ACs it covers. Update
   `## PRs` and `status`.
6. **Do not touch merged or reviewed slices.** See the regeneration rule.

## The regeneration rule

Regeneration from spec is only allowed **before a human has reviewed the PR**.

Once review has started, the PR is a shared artifact: rebase, fix forward, push
incremental commits. Regenerating discards the reviewer's context and silently
invalidates their approvals. If regeneration is unavoidable after review, close the
old PR with an explanation and open a new one — never force-push a fresh generation
over a reviewed branch.

## Cross-repo and protocol work

When `repos` has more than one entry, PRs are opened in `repos` order and each PR
body states which upstream PR it depends on. Merging out of order is a spec
violation, not an optimisation.

When `specs` is non-empty:
- the implementation PR references the section of the MSC it implements,
- unmerged MSCs require the implementation to be feature-flagged and documented as
  unstable (unstable prefixes, not stable identifiers), and
- any deviation from the MSC text is recorded in `## Drift log`, not silently
  resolved in favour of the code.

## Drift-log format

Append-only, newest last:

```
### 2026-09-14 — drift check (base 4f2a1c9 → head 9b17e02)
- `ReactionsReader.getLastReactionEvent` now takes a `CallMembership` instead of an
  event id → AC2 and AC3 check commands still valid, slice 3 needs rework
- BLOCKING: decision D2 assumes a membership event change may keep a hand raised; main
  now clears all reaction relations on membership replacement. Needs owner decision.
```

Drift entries are never rewritten or deleted, including entries that were later
resolved. The log is the record of why the implementation diverged from the
exploration.

## Hard rules

- Never fill a `[NEEDS CLARIFICATION]` marker with a guess, in any state.
- Never put file paths, symbols or library names in the product spec.
- Never reference a file path or an internal symbol in `## Decisions` or
  `## Acceptance criteria`. Behaviour, protocol identifiers, concepts and test names
  only.
- Never edit `<stem>.product.md` after `draft`, and never renumber an FR or SC id.
- Never add a line that does not constrain the implementation, constrain its
  verification, or record a measured fact. It goes in the sidecar or nowhere.
- Never modify `## Decisions`, `## Problem`, or `## Acceptance criteria`. These are
  the human contract. Propose changes in `## Open questions` and set `blocked`.
- Never invent measurements or acceptance checks. Absent is better than plausible.
- Never widen scope past `## Out of scope`, even when the fix looks trivial.
- Never open a PR while `status` is `draft`, any `exploration.*`, or `blocked`.
- Never delete a spec file. Terminal states are `in_production` or `abandoned`.
- If the spec and current `main` disagree about how the system works, **main wins as
  description, the spec wins as intent** — record the difference and stop.

## Spec template

```markdown
---
status: draft
blocked_from: null
title:
owner:
signoff:
  eng: pending
  design: pending
  product: pending
experiment_ref:
base:
repos: []
specs: []
supersedes: []
superseded_by: null
---

## Problem

## Decisions
- D1 — <decision> — <why>

## Acceptance criteria
- AC1 [FR-###] — <observable behaviour>
  - check: <command or exact manual steps>
- AC2 [internal] — <invariant>
  - check: <command, anchored by test name>

## Rejected alternatives
- <approach> — <why it failed> — <evidence>

## Measurements
- <metric>: <value> (method: <command / setup>)

## Out of scope

## Slicing plan
1. <slice> — covers AC1 — depends on: none

## Drift log

## PRs
```
