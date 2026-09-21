# The MatrixRTC SDK package

Element Call's MatrixRTC logic (session membership, keep-alive, transport
tokens, media key exchange) runs in the Rust `matrix-rtc` crate, compiled to
WebAssembly and shipped as the npm package `@element-hq/matrix-rtc`. The
package is built and published by the
[`npm-web-bindings.yml`](https://github.com/element-hq/matrix-rust-rtc/blob/main/.github/workflows/npm-web-bindings.yml)
workflow of the `matrix-rust-rtc` repository, from its
`MatrixSdkArchitectureDraft/web-test-app` directory. Element Call loads it in
`src/matrix-rtc-sdk/index.ts`, the only module that imports the package
directly.

## Where the package comes from

For now the package lives on the **GitHub Packages** npm registry
(`https://npm.pkg.github.com`), not on npmjs.com. **This is a stop-gap** for
the phase in which the crate's API still changes with every push: publishing
from the crate's CI into a registry that comes with the repository needs no
account or secret upstream, and nothing else consumes the package yet. Once
the SDK is ready for consumers beyond Element Call, it should be published to
**npmjs.com** as `@element-hq/matrix-rtc`, which makes everything in this
document about tokens and scopes go away: `pnpm install` works anonymously
again, forks and Renovate can install, component hosts need no setup, and the
alias in `package.json` and the scope line in `.npmrc` are deleted.

Until then, two properties of GitHub Packages shape the setup below:

- **Every request needs a token**, including reads of public packages. There
  is no anonymous install.
- **A package is scoped to the owner of the repository whose CI published
  it.** While the crate is developed on the `BillCarsonFr` fork, the package is
  published as `@billcarsonfr/matrix-rtc`; once it is published from
  `element-hq/matrix-rust-rtc` it becomes `@element-hq/matrix-rtc`.

So that the code does not have to change when that happens, `package.json`
installs the fork's package under the final name:

```json
"@element-hq/matrix-rtc": "npm:@billcarsonfr/matrix-rtc@next"
```

and the repository's `.npmrc` maps only the scope to the registry:

```ini
@billcarsonfr:registry=https://npm.pkg.github.com
```

When the package moves to `element-hq`, change the alias to the plain package
and the scope line in `.npmrc` accordingly; nothing else in the repository
refers to the fork's name.

## Setting up your machine

1. Create a **personal access token (classic)** at
   <https://github.com/settings/tokens> with only the `read:packages` scope.
   Fine-grained tokens do not work with GitHub Packages.
2. Add it to your **user-level** npm config. Never put it in the repository's
   `.npmrc`:

   ```sh
   echo "//npm.pkg.github.com/:_authToken=<your token>" >> ~/.npmrc
   ```

3. Run `pnpm install` as usual.

Without the token, `pnpm install` fails while resolving
`@billcarsonfr/matrix-rtc` with a `401` or `404` from `npm.pkg.github.com`;
that error always means "no or wrong token", never "the package does not
exist".

## CI and other consumers

A workflow's built-in `GITHUB_TOKEN` can only read packages owned by the
repository's own owner, so element-hq's workflows cannot read a package owned
by the `BillCarsonFr` user. The workflows that run `pnpm install` therefore
write a personal access token from the repository secret
`MATRIX_RTC_NPM_TOKEN` (scope `read:packages`) to `~/.npmrc` before installing.
Keep in mind:

- **Pull requests from forks and from Renovate do not receive secrets**, so
  their installs fail until the package is readable with the built-in token.
- **Hosts of the [component](../README.md#element-call-as-a-component-experimental)**
  install it as a git dependency whose `prepare` script runs
  `pnpm install --frozen-lockfile` in this repository, so they need the same
  token in their `~/.npmrc` or CI.

Publishing from `element-hq/matrix-rust-rtc` (and granting the Element Call
repository access to the package) would let the built-in token work for
element-hq's own workflows, but that only patches the CI case. The intended end
state is the npmjs.com publication described above, which removes the token
requirement for everyone.

## Versions

The package version tracks the crate's `Cargo.toml`. Every push to the tracked
branches of `matrix-rust-rtc` publishes a `next` pre-release named
`<version>-next.<run number>.<short sha>`, and a `matrix-rtc-v<version>` tag
publishes `latest`. Element Call follows `next`; `pnpm install` picks up a new
pre-release only when the lockfile is updated, e.g. with
`pnpm update @element-hq/matrix-rtc`.

The publish job runs only after the crate's own `cargo test` job passed on a
_push_ (pull-request runs never publish). If a `next` build you expect is
missing, check that workflow's push runs for a failed crate job and re-run it;
its tests are known to be timing-sensitive.

## Developing against a local crate checkout

To run Element Call against a crate you are changing, build the package there
and link it, instead of waiting for CI:

```sh
cd ../matrix-rust-rtc/MatrixSdkArchitectureDraft/web-test-app
npm install && npm run build      # produces dist/
```

then add it to `.links.cjs` in this repository and run `pnpm links:on`, as
described in [Developing with linked packages](./linking.md):

```cjs
"@element-hq/matrix-rtc": "../matrix-rust-rtc/MatrixSdkArchitectureDraft/web-test-app",
```

`pnpm links:off` restores the registry package before committing.

## How the wasm is loaded

`initMatrixRtcSdk()` in `src/matrix-rtc-sdk/index.ts` is the single entry
point: it awaits the package's `initAsync`, then installs the log sink that
routes the crate's logs into Element Call's logger. The wasm is imported as
`@element-hq/matrix-rtc/wasm?url`, so the app builds emit it as an asset next
to the other `.wasm` files and the component build inlines it. Unit tests read
the bytes from the installed package instead (`src/utils/test-matrix-rtc.ts`),
since vitest has no server to fetch from. A component host can point at a copy
it serves itself through `initializeElementCall(config, { matrixRtcWasm })`.
