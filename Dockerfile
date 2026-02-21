FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund \
    && npm install --no-save --no-audit --no-fund @rollup/rollup-linux-arm64-musl @swc/core-linux-arm64-musl
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/dist
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "scripts/local-db-server.mjs"]
