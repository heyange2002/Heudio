FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/public/ /usr/share/nginx/html/
EXPOSE 80
