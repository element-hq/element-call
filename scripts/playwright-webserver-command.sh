#!/bin/sh
if [ -n "$USE_DOCKER" ]; then
    set -ex
    yarn build
    docker build -t element-call:testing .
    exec docker run --rm --name element-call-testing -p 8080:8080 -v ./config/config.devenv.json:/app/config.json:ro,Z element-call:testing
else
    cp config/config.devenv.json public/config.json
    exec yarn dev
fi
