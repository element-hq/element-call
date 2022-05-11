FROM node:16-buster as builder

WORKDIR /src

COPY . /src/element-call
RUN element-call/scripts/dockerbuild.sh

# App
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=builder /src/element-call/dist /app
COPY config/default.conf /etc/nginx/conf.d/

USER root

RUN rm -rf /usr/share/nginx/html

USER 101
