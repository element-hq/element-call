# Audio quick menu — exploration notes

Not load-bearing. Nothing here constrains the implementation; constraints live in the
feature spec.

## Findings from the spike

- **The shared slider names itself after its tooltip.** `Slider` wraps its thumb in a
  compound `Tooltip`, which sets `aria-labelledby` on the thumb and so overrides the
  `label` prop's `aria-label`. A screen reader announced the volume control as "50%".
  Worked around at the call site by putting the control's name into the tooltip text.
  The same defect exists in Settings → Audio today and would be better fixed in
  `Slider` itself.
- **Arrow keys inside the menu.** The radix menu treats arrow keys as navigation
  between items, so a slider placed inside it never receives them. The slider row stops
  propagation for arrow/Home/End. Without this the slider is mouse-only, which would
  have failed AC20 silently.
- **jsdom gaps.** The radix slider needs `ResizeObserver` and the meter needs
  `AudioContext`; neither exists in jsdom, so both are stubbed per test file rather
  than globally.
- **Snapshot churn.** `LobbyView` and `InCallView` snapshots changed because the mic
  button is now wrapped in the chevron container in cases that previously rendered a
  bare button. Reviewed before updating; the change is the intended one.

## Findings from design review

- **An invented design token fails silently.** The meter's bars were written with
  `--cpd-radius-pill-effective`; the token is `--cpd-radius-pill-effect`. An unknown
  custom property makes the whole `border-radius` declaration invalid, so the bars
  rendered square with no error anywhere. Worth grepping for the token name before
  using one.
- **A sticky child paints over the menu's border.** `FloatingMenu` draws its border as
  an `outline` inset by one border width rather than as a real border. A
  `position: sticky` child is positioned, so it paints above that outline and its
  opaque background covered the border at the left and right edges. Fixed with a
  matching inline margin on the sticky row.
- **The bar geometry has two coupled knobs.** The bars share the row, so their width
  is whatever the gaps leave over: raising the gap thins them and raising the count
  thins them too. Moving both at once cancels out, which cost two review rounds.
  Across the inset row (~248px at the menu's 340px maximum):

  | bars | gap | bar width | bar:gap |
  | ---- | --- | --------- | ------- |
  | 20   | 8px | 4.8px     | 0.60    |
  | 18   | 8px | 6.2px     | 0.78    |
  | 17   | 8px | 7.1px     | 0.88    |
  | 16   | 8px | 8.0px     | 1.00    |

  The design sits near 0.8, hence 18 bars at an 8px gap.

- **The bars line up with the label column, not the menu edge.** A menu item keeps a
  `4x` margin after its label plus a `2x` column reserved for the chevron, on top of
  the menu's own `4x` padding, so the meter's inline-end inset is `2 * 4x + 2x`.

## Still open with design

- The mockup marks the active device with a radio circle; the menu marks it with a
  device icon and a checkmark, which is the existing pattern shared with the camera
  chevron. Changing it would either change the camera menu too or make the two
  inconsistent. Left as-is pending design sign-off.

## Not done

- Storybook interaction tests were not run; that project drives a real browser.
  `AudioLevelMeter.stories.tsx` covers the five meter states for visual review.
- Sticky positioning, the focus border and the bar geometry are all unverified by
  tests: jsdom has no layout. The tests assert the DOM structure that makes them
  possible, and the rest was checked by eye in a browser.
- No measurement of what the meter's second capture costs while a call is running.
  This is the main thing left before sign-off, and it is the decision most likely to
  be revisited: if the cost is material, D1 gets narrower.
- `oxfmt` covers markdown, and `AGENTS.md`, `_TEMPLATE.product.md` and the product
  spec do not match its style, so `pnpm format:check` fails on them. Left alone: the
  product spec is not editable after `draft` and the other two are process documents.
  Either format them in a separate commit or exclude the folder from `oxfmt`.
