#!/bin/sh
if [ -n "$USE_DOCKER" ]; then
    set -ex
    yarn build
    IMAGE_NAME=localhost:5000/element-call:testing
    docker build -t "$IMAGE_NAME" .
    exec docker run --rm --name element-call-testing -p 8080:8080 -v ./config/config.devenv.json:/app/config/json:ro,Z "$IMAGE_NAME"
else
    cp config/config.devenv.json public/config.json
    exec yarn dev
fi
