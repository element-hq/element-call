FROM nginxinc/nginx-unprivileged:alpine

COPY ./dist /app
COPY config/nginx.conf /etc/nginx/conf.d/

USER root

RUN rm -rf /usr/share/nginx/html

USER 101
