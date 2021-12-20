FROM node:16-buster as builder

WORKDIR /src

COPY . /src/matrix-video-chat
RUN matrix-video-chat/scripts/dockerbuild.sh

# App
FROM nginx:alpine

COPY --from=builder /src/matrix-video-chat/dist /app

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
