## Quickstart guide

Run:

```bash
./scripts/setup-linking.sh
```

Read the script output:

```
Setup complete.
Update: .links.cjs to your liking
Run: 'pnpm links:on' to test your .links.cjs
Run: 'git commit' with links enabled to test the git pre-commit hook.
Run: 'pnpm links:off' to be able to commit again
Run: 'git config --local core.hooksPath ""' to allow committing with linking (not recommended)
Run: 'rm links.cjs' & 'git config --local core.hooksPath ""' to fully revert what this script did
```

# Developing with linked packages

If you want to make changes to a package that Element Call depends on and see those changes applied in real time, you can create a link to a local copy of the package. `pnpm` has a command for this (`pnpm link`), but it's not recommended to use it as it ends up modifying package.json with details specific to your development environment.

Instead, create a file named `.links.cjs` in the Element Call project directory (or run `./scripts/setup-linking.sh` to create a template), listing the names and paths of any dependencies you want to link. For example:

```cjs
// Packages to link to local checkouts
module.exports = {
  "matrix-js-sdk": "../your/path/matrix-js-sdk",
  "matrix-widget-api": "../your/path/matrix-widget-api",
};
```

Then run `pnpm links:on`. (this will activate the pnpm file + run `pnpm install` to setup the linking)

## Hooks

Changes in `.links.cjs` will also update `pnpm-lock.yaml` when `pnpm install` is executed. The lockfile will then contain the local
version of the package which would not work on others dev setups or the github CI.

One always needs to remove the pnpm `readPackage` script (the `.pnpmfile.cjs`) and run:

```bash
pnpm install
```

before committing a change.

To make this less of a foot gun we added a git hook.
A `pre-commit` hook will check if linking is currently used. If it detects
a `.pnpmfile.cjs` file it will abort the commit with an explanatory message.
You will then need to run `pnpm links:off` and commit again.

To activate the hooks configure git with (when using the setup script (`./scripts/setup-linking.sh`) this is already done):

```bash
git config --local core.hooksPath .githooks
```

This will add the hook path for this repository only to .gihooks. which is a tracked (by git) folder containing the pre-commit hook.

## Background

Information, why this approach is used can be found in the [linking concept reasoning](./linking_concept_reasoning.md) document.
