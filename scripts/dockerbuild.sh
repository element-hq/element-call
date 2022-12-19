#!/bin/sh

set -ex

export VITE_APP_VERSION=$(git describe --tags --abbrev=0)

yarn install
yarn run build
