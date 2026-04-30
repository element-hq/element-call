# Contributing code to Element

Element follows the same pattern as the [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk/blob/develop/CONTRIBUTING.md).

# Contributing to Element Call

Element Call is a native Matrix video conferencing application built on
[MatrixRTC (MSC4143)](https://github.com/matrix-org/matrix-spec-proposals/pull/4143)
and [LiveKit](https://livekit.io/). It runs in multiple deployment contexts — as a
standalone web app and as a widget embedded in Element Web, Element X iOS, and
Element X Android. It is also the primary R&D foundation for MatrixRTC, which means
its architecture, maintainability, and flexibility are held to a high standard.

We welcome contributions from the community. This document explains how to
contribute effectively so that both you and the maintainers get the best outcome.

## Issue First Policy

> [!IMPORTANT]
> Before writing a single line of code for a new feature or UI change, you **must**
> open an issue and have the approach agreed with the maintainers.
>
> **We will not review or merge feature or UI pull requests that arrive without a
> corresponding, pre-approved issue.**

This is not gatekeeping — it's how we prevent wasted effort on both sides. Element
Call must work correctly across multiple deployment contexts and meet specific product
and design requirements. It is also a fast-moving codebase that underpins ongoing
MatrixRTC development. A PR that looks reasonable in isolation can easily conflict
with in-progress work, planned architecture changes, or design decisions that haven't
been publicly documented yet.

The issue is where we resolve all of that **before** anyone writes code.

**Bug fixes** are no exception — most confirmed bugs should already have an issue anyways, existing issues that are marked as bugs have an implicit maintainer approval. If the solution for the bug is controversial it is highly recommended to discuss the approach in the issue before opening a PR.

## Contribution Workflow

1. **Open an issue** using the [Enhancement request](https://github.com/element-hq/element-call/issues/new?template=enhancement.yml) template.
2. **Wait for feedback.** A maintainer will comment on the issue **within two weeks**. The use case and approach will get dicussed.
   This may involve questions, suggestions, or a request to adjust scope.
   This also allows to bring design and product into the loop before code gets created.
3. **Get a green light.** Wait for explicit approval from a maintainer before starting
   implementation.
4. **Implement.** Write the code against the agreed approach.
5. **Open a PR.** Link to the issue in your PR description and satisfy the checklist
   in the PR template.

## Code Quality

Element Call moves fast and the codebase must stay clean and maintainable.

- **Take responsibility for AI-generated code.** AI tools can be a useful aid, but we expect all the generated code to be understood and reasoned about by the contributor. Questions by the maintainers should be answered without just forwarding them to AI. The maintainers also have access to AI tools. If your contribution is just transporting messages between LLM <-> maintaines all our time is better used if the maintainers decide to interact with AI for this specific problem by themselves.
- **Think across deployment contexts.** Changes must work correctly in both standalone
  and widget modes. Consider how your change interacts with Element Web, Element X
  iOS, and Element X Android.
- **Write tests.** New functionality should be covered by tests. Where it is feasible,
  existing uncovered code touched by your PR should also gain tests.

## Contributor License Agreement

All contributors must sign the
[Element Contributor License Agreement](https://cla-assistant.io/element-hq/element-call)
before their contribution can be merged. The CLA assistant bot will prompt you
automatically when you open a PR.

## Getting Help

The best place to ask questions about Element Call development is the MatrixRTC room:

**[#matrixRtc:matrix.org](https://matrix.to/#/#matrixrtc:matrix.org)**
