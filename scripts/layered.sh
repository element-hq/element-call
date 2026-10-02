#!/usr/bin/env bash

# Installs dependencies, then swaps matrix-js-sdk for a branch of the same
# name as the pull request branch under test if one exists. This is what
# lets CI test an Element Call branch together with a matrix-js-sdk branch
# before either is merged. Inspired by scripts/layered.sh in element-web.
#
# Usage: scripts/layered.sh [pnpm install flags]
#
# The layering is only performed when package.json uses the develop branch of
# matrix-js-sdk and the run is for a pull request whose branch has a matrix-js-sdk
# counterpart. Otherwise the dependency is left as pnpm-lock.yaml pins it.
#
# The matrix-js-sdk checkout is nested inside this directory because some CI
# systems do not allow moving above the primary checkout. It is git-ignored.
#
# Set JS_SDK_GITHUB_BASE_REF to a ref to use that exact ref of matrix-js-sdk
# instead of looking for a matching branch.
#
# This script is only meant to be used in CI. For local development use
# see docs/linking.md.

set -ex

# Paths below are relative to the repository root.
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile "$@"

js_sdk_dep=$(jq -r '.devDependencies["matrix-js-sdk"]' < package.json)

# Only layer when package.json follows the branch head rather than pinning a
# release, so a release build keeps its pinned version.
if [ "$js_sdk_dep" != "github:matrix-org/matrix-js-sdk#develop" ]; then
    echo "layered.sh: Skipping matrix-js-sdk fetch and install as package.json pins $js_sdk_dep"
    exit 0
fi

if ! scripts/fetchdep.sh matrix-org matrix-js-sdk "${JS_SDK_GITHUB_BASE_REF:-}"; then
    echo "layered.sh: No matching matrix-js-sdk branch, keeping the locked version"
    exit 0
fi

# matrix-js-sdk pins its pnpm version in `devEngines` only. Under corepack,
# pnpm does not switch versions on its own and corepack, finding no
# `packageManager` field there, would walk up to this project's and use
# ours. Pinning it in the clone makes every pnpm invocation inside that
# directory, including the `prepare` script run by pack, use the right one.
js_sdk_pnpm="pnpm@$(jq -r '.devEngines.packageManager.version' < matrix-js-sdk/package.json)"
jq --arg pm "$js_sdk_pnpm" '.packageManager = $pm' matrix-js-sdk/package.json > matrix-js-sdk/package.json.tmp
mv matrix-js-sdk/package.json.tmp matrix-js-sdk/package.json
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Install matrix-js-sdk's build dependencies. `prepare` runs on pack below,
# so it is skipped here.
(cd matrix-js-sdk && pnpm install --frozen-lockfile --ignore-scripts)

# Rather than `pnpm link`, build matrix-js-sdk into a tarball and install
# that. This better reflects a clean install: dependencies may be hoisted
# and shared, and there is no tsconfig.json to pick up sources from.
(cd matrix-js-sdk && pnpm pack --out matrix-js-sdk.tgz)
pnpm install "$(pwd)/matrix-js-sdk/matrix-js-sdk.tgz" "$@"
