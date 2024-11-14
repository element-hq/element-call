FROM nginxinc/nginx-unprivileged:alpine

COPY ./dist /app
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
