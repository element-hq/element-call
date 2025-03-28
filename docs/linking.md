# Developing with linked packages

If you want to make changes to a package that Element Call depends on and see those changes applied in real time, you can create a link to a local copy of the package. Yarn has a command for this (`yarn link`), but it's not recommended to use it as it ends up modifying package.json with details specific to your development environment.

Instead, you can use our little 'linker' plugin. Create a file named `.links.yaml` in the Element Call project directory, listing the names and paths of any dependencies you want to link. For example:

```yaml
matrix-js-sdk: ../path/to/matrix-js-sdk
"@vector-im/compound-web": /home/alice/path/to/compound-web
```

Then run `yarn install`.

## Hooks

Changes in `.links.yaml` will also update `yarn.lock` when `yarn` is executed. The lockfile will then contain the local
version of the package which would not work on others dev setups or the github CI.
One always needs to run:

```bash
mv .links.yaml .links.disabled.yaml
yarn
```

before committing a change.

To make it more convenient to work with this linking system we added git hooks for your conviniece.
A `pre-commit` hook will run `mv .links.yaml .links.disabled.yaml`, `yarn` and `git add yarn.lock` if it detects
a `.links.yaml` file and abort the commit.
You will than need to check if the resulting changes are appropriate and commit again.

A `post-commit` hook will setup the linking as it was
before if a `.links.disabled.yaml` is present. It runs `mv .links.disabled.yaml .links.yaml` and `yarn`.

To activate the hooks automatically configure git with

```bash
git config --local core.hooksPath .githooks/
```
