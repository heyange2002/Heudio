FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY services/qq-music-api/package.json services/qq-music-api/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY services/qq-music-api/start.cjs services/qq-music-api/start.cjs
RUN mkdir -p /app/.auth-state && chown node:node /app/.auth-state
ENV PORT=3200 NODE_ENV=production QQ_AUTH_STATE_PATH=/app/.auth-state/qq-device.json
USER node
EXPOSE 3200
CMD ["node", "services/qq-music-api/start.cjs"]
