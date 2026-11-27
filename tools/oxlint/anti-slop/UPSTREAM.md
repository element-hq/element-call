# Upstream

Vendored from https://github.com/dmmulroy/anti-slop.

- Source path: `skills/install-anti-slop/assets/anti-slop/`
- Source commit: `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13). The
  installed skill under `.agents/skills/install-anti-slop` was verified
  byte-identical to that commit before copying.
- Installed plugin paths: `tools/oxlint/anti-slop/index.ts` (generic rules,
  registered in `.oxlintrc.json`) and `tools/oxlint/anti-slop/effect/index.ts`
  (Effect rules, not registered: this repository does not depend on `effect`).
- Companion dependency: `@oxlint/plugins`, pinned to the installed `oxlint`
  version. Bump both together.
- Local deviations: none. The nested `vendor/eslint-stylistic/` licence and
  provenance travel with the copied rule.

To update, run the `install-anti-slop` skill's update procedure rather than
re-copying over this directory.
