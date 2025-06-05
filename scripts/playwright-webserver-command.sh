#!/bin/sh
if [ -n "$USE_DOCKER" ]; then
    set -ex
    yarn build
    IMAGE_NAME=localhost:5000/element-call:testing
    docker build -t "$IMAGE_NAME" .
    LOG_DIR=./webserver-logs
    mkdir -p "$LOG_DIR"
    exec docker run --rm --name element-call-testing -p 8080:8080 -v ./config/config.devenv.json:/app/config/json:ro,Z "$IMAGE_NAME" >"${LOG_DIR}/access.log" 2>"${LOG_DIR}/error.log"
else
    cp config/config.devenv.json public/config.json
    exec yarn dev
fi
