FROM node:24-alpine
WORKDIR /app
COPY backend/ ./
ENV HOST=0.0.0.0 PORT=3001 NODE_ENV=production
USER node
EXPOSE 3001
CMD ["node", "src/server.mjs"]
