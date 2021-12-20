FROM node:16-buster as builder

WORKDIR /src

COPY . /src/matrix-video-chat
RUN matrix-video-chat/scripts/dockerbuild.sh

# App
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=builder /src/matrix-video-chat/dist /app
COPY scripts/default.conf /etc/nginx/conf.d/

USER root

RUN rm -rf /usr/share/nginx/html

USER 101
