---
name: handoff
description: Implement the first cut of a task and stop for a direction check before the quality pass.
argument-hint: <the task>
disable-model-invocation: true
---

Task: $ARGUMENTS

Stop after the first implementation and hand it back before the quality pass.

## Before the hand-off

- Run the narrowest check that rules out an obviously broken hand-off: the test
  file for the touched code, `tsc` on its own, a single story. Not the full
  `pnpm lint`, not the whole suite.
- If a wider check is needed before feedback can be useful, keep it to the touched
  code and say why it was needed.
- Leave wider refactors, extra tests and documentation polish out. They are
  follow-up work, not part of the first hand-off.

## The hand-off

Stop and ask whether the direction is right. The message says:

- what was built and where, in a few lines,
- which check ran and what it returned, verbatim if it failed,
- what was left out on purpose,
- the decisions that could have gone another way.

Do not continue past this point on your own.

## After the user confirms

The skill ends here. Continue with the quality pass as usual.
