# Stage 1: Install dependencies and build
FROM oven/bun:1.3.11-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/design-system/package.json packages/design-system/
COPY packages/email/package.json packages/email/
COPY packages/env/package.json packages/env/
COPY packages/jobs/package.json packages/jobs/
COPY packages/notifications/package.json packages/notifications/
COPY packages/observability/package.json packages/observability/
COPY packages/whatsapp/package.json packages/whatsapp/
COPY packages/e2e/package.json packages/e2e/
COPY packages/zero/package.json packages/zero/
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_ZERO_URL
ARG VITE_CDN_URL
ARG VITE_IMMICH_URL
ENV SKIP_VALIDATION=true
ENV VITE_ZERO_URL=$VITE_ZERO_URL
ENV VITE_CDN_URL=$VITE_CDN_URL
ENV VITE_IMMICH_URL=$VITE_IMMICH_URL
RUN cd apps/web && bunx --bun vite build

# Stage 2: Migrator (runs pending DB migrations)
FROM oven/bun:1.3.11-slim AS migrator
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/db packages/db
COPY --from=build /app/package.json package.json
CMD ["bun", "run", "packages/db/scripts/migrate.ts"]

# Stage 3: Production
FROM oven/bun:1.3.11-slim AS production
WORKDIR /app
COPY --from=build /app/apps/web/.output .output
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", ".output/server/index.mjs"]
