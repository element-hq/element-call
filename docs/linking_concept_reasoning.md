### Why do we not enable .pnpmfile.cjs by default

Background: The presence of the `.pnpmfile.cjs` adds a field to the `pnpm-lock.yaml` called: `pnpmfileChecksum`. This field is a checksum of the content of the `.pnpmfile.cjs` file.
`pnpm install --frozen-lockfile` **fails** if there is a `.pnpmfile.cjs` but no `pnpmfileChecksum` or vice versa (or on mismatch).

_TLDR: running with `--ignore-pnpmfile` will fail if `pnpmfileChecksum` is present._

#### `pnpmfileChecksum` + renovate bot

When the renovate bot creates a PR it runs `pnpm install --ignore-pnpmfile`. This means that the `pnpmfileChecksum` in the lockfile will be **empty**.
This breaks builds that **don't** ignore the `.pnpmfile.cjs`-file. (CI that runs on the renovate PR)
From here we have two possible paths:

- ignore `.pnpmfile.cjs` in all CI builds (CI will also fail if we accidently add it locally).
- fixup the `pnpm-lock.yaml` in the renovate PR to contain the correct `pnpmfileChecksum`.

Ignoring in all CI builds means that CI will always fail if we enable the linking system.
This is annoying but can be worked around with the git hook we provide that at least lets us know that we are
commiting with enabled linking.
Only if we remember setting it back/disbale linking (or let ourselves remember by the git hook) the CI will work.

#### Summary

- We will always run into conflicts with the `pnpmfileChecksum` because in renovate prs it will be empty (`--ignore-pnpmfile`)
- To keep it simple we set `--ignore-pnpmfile` in all of our CI builds to see issues immediately.
- The only solution is to never have a `.pnpmfile.cjs` in the repository when pushing.
  - This way there will never be a commit with `pnpmfileChecksum` in the lockfile.
  - renovate (which uses `--ignore-pnpmfile` which we cannot disable) and other CI will work.
- We are able to use the linking system locally if we `cp` this file from the scripts folder into `./` on demand.
- `pnpm links:on` and `pnpm links:off` + `./scripts/setup-linking.sh` will help us with this.
