# syntax=docker/dockerfile:1

# ---- Build stage: compile server + web ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine
RUN apk add --no-cache ffmpeg tini \
  && mkdir -p /data && chown node:node /data
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
