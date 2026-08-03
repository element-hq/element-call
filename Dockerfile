FROM alpine AS builder

COPY ./dist /dist

# Compress assets to work with nginx-gzip-static-module
WORKDIR /dist/assets
RUN gzip -k ../index.html *.js *.map *.css *.wasm *-app-*.json 

FROM nginxinc/nginx-unprivileged:alpine-slim

COPY --from=builder ./dist /app

COPY config/nginx.conf /etc/nginx/conf.d/default.conf
