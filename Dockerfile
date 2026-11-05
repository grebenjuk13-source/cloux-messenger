# CLOUX now serves the official Element Web release.
# Upstream project: https://github.com/element-hq/element-web
FROM ghcr.io/element-hq/element-web:v1.12.33

# Render's default web service port.
ENV ELEMENT_WEB_PORT=10000
COPY config.json /app/config.json
EXPOSE 10000
