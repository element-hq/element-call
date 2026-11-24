<!-- Maintainer template. External contributors use the default template. -->

## Motivation and context

<!-- Link the issue this closes, or explain the context for a bug fix -->

## Plan (optional)

_Reviewer: read and challenge this plan carefully as part of the review._

<!--
Only if this change was made with AI; delete this section otherwise.
Plan := the final version of the human-edited plan/prompt this change used.
It is not the implementation plan from Claude's plan mode. That goes under Content.
-->

## Content

<!--
Mandatory. Describe what has been changed.
This is also where an LLM implementation plan or other plan artifacts are linked:
paste them in a collapsed <details> block, or attach them as files.
-->

## Screenshots / GIFs / Storybook links

<!--

You can use a table like this to show a before/after comparison.
Uncomment the markdown table below and fill in the last line:

|Before|After|
|-|-|
|||

-->

## Tests

<!-- Explain how you tested your changes -->

- Step 1
- Step ...

## Checklist

- [ ] Exactly one `PR-*` label is set.
- [ ] New behaviour has unit tests, a story if it renders, and an e2e spec if it is user-facing.
- [ ] Visible changes link their Storybook stories (add the `storybook build` label for a preview deploy).
- [ ] Visible changes without a story include screenshots or a video.
- [ ] Checked standalone, as a widget and as a component.
- [ ] Linter and other CI checks pass.
