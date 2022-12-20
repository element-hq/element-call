FROM --platform=$BUILDPLATFORM node:16-buster as builder

WORKDIR /src

COPY . /src
RUN scripts/dockerbuild.sh

# App
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=builder /src/dist /app
COPY config/nginx.conf /etc/nginx/conf.d/

USER root

RUN rm -rf /usr/share/nginx/html

USER 101
