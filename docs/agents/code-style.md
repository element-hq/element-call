# Code style

_Clean Code_ (Robert C. Martin): small functions, intention-revealing names, low
noise.

## Reuse before you build

Look before you write, in this order:

1. **Compound Web** — `@vector-im/compound-web` for buttons, tooltips, alerts,
   dialogs, menus, form controls, avatars; icons in
   `@vector-im/compound-design-tokens/assets/web/icons`.
2. **This repo** — `src/button/`, `src/components/`, `src/input/`, `src/form/`,
   `src/tabs/`, and `Modal`, `Avatar`, `Toast`, `Slider`, `ErrorView`,
   `FullScreenView` at the root of `src/`.
3. **The nearest existing feature** — grep for the same shape first. A hook is
   often what you want to extract, not a component.

If nothing fits, name the new shared component in the PR body and say what you
rejected and why — never add one silently. Extend or parameterise before forking,
and extract shared logic into a hook both callers use before copying it; if you
copy, the PR says so.

## Ordering

- **Newspaper order.** Headline first, detail down. A file opens with what it
  exists to provide.
- **Stepdown rule.** Caller above callee. A helper used by one function sits
  beneath it, which needs a `function` declaration, not a `const` arrow. Existing
  arrow components above their callers are not a pattern to extend — nor to churn.
- **Suites.** Test cases first, helpers below. Older suites invert this; follow the
  rule in new ones, don't reorder old ones.
- **Names.** What a thing means, not what it is made of: `naturalLayout$`, not
  `computedLayout$`. Comments explain why, never what.

## TypeScript, React and RxJS idiom win on a clash

- Hooks stay unconditional at the top of a component.
- `useCallback` / `useMemo` dependency arrays sometimes force inlining.
- An RxJS pipeline stays one expression. Name the behavior, not each operator.
- A long factory is fine when it reads as a list of named behaviors.
  `CallViewModel.ts` is long because the domain is.
- Marble test tables are dense on purpose.

## Enforced by lint

- Copyright header on every file: `Copyright <current year> Element Creations Ltd.`
  plus the AGPL / commercial SPDX line.
- `logger` from `matrix-js-sdk/lib/logger`, never `console`, and no top-level
  `logger.getChild()`. The `console` ban is only enforced under `src/*/**`.
- No floating or misused promises; async functions typed `Promise<T>`.
- Inline type imports (`import { type Foo }`), so matrix-js-sdk stays lazily
  loadable.
- Deep-import `matrix-js-sdk/lib/<module>` as the codebase does. Banned is the bare
  `matrix-js-sdk/lib`, `lib/index` and anything under `src/`.

## CSS

- Compound components and `--cpd-*` tokens in CSS modules. A hardcoded colour or px
  spacing is a design question, not a licence to inline a hex.
- Size against the root, not the window: `@container element-call (…)` and
  `cqw` / `cqh`, never `@media (width)` or `vw` / `vh`. Media queries stay correct
  only in standalone-only views — home, login.
- Style `[data-element-call-root]`, never `body` or `:root`; the component build
  makes those stand for the root (`component/build/scopeStylesToRoot.ts`).

## Strings and a11y

- Strings through `t()`: add the key, run `pnpm i18n`, fill `locales/en/app.json`.
  Other locales come from Localazy; never hand-edit them.
- `t` from `useTranslation()`, or `src/utils/i18n.ts` outside React. Never the
  `i18next` global — several instances share a page.
- Accessible names on controls, `aria-pressed` on toggles, keyboard reachability.
  `jsx-a11y` rules are errors; `vitest-axe` is available.
