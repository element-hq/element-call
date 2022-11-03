#!/bin/sh

set -ex

export VITE_DEFAULT_HOMESERVER=https://call.ems.host
export VITE_PRODUCT_NAME="Element Call"

git clone https://github.com/matrix-org/matrix-js-sdk.git
cd matrix-js-sdk
git checkout robertlong/group-call
yarn install
yarn run build
yarn link

cd ../element-call

export VITE_APP_VERSION=$(git describe --tags --abbrev=0)

yarn link matrix-js-sdk
yarn install
yarn run build
