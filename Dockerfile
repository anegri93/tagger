# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# --- deps (workspace-aware: root + sdk) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY sdk/package.json ./sdk/
RUN pnpm install --frozen-lockfile

# --- build backend + sdk + ui/demo bundle ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/sdk/node_modules ./sdk/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY sdk ./sdk
COPY src ./src
COPY scripts ./scripts
COPY ui ./ui
# 1) compilar SDK (workspace dep del demo)
RUN cd sdk && pnpm build
# 2) compilar backend TS → dist
RUN pnpm build
# 3) bundlear demo UI (esbuild). NO inyectamos API_KEY en build;
#    el demo la pide a /demo/config en runtime.
RUN pnpm run build:demo

# --- prod deps (sin devDependencies) ---
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY sdk/package.json ./sdk/
RUN pnpm install --frozen-lockfile --prod

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/sdk/node_modules ./sdk/node_modules
COPY --from=build /app/sdk/dist ./sdk/dist
COPY --from=build /app/sdk/package.json ./sdk/package.json
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/migrations
COPY data/seed.sql ./data/seed.sql
COPY package.json pnpm-workspace.yaml ./
COPY --from=build /app/ui ./ui
COPY postman ./postman
COPY docs ./docs
COPY openapi.yaml ./openapi.yaml
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
