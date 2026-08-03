#!/bin/sh

set -ex

export VITE_APP_VERSION=$(git describe --tags --abbrev=0)

corepack enable
pnpm install
pnpm run build
