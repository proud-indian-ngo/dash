# Stage 1: Install dependencies
FROM oven/bun:1.3.10 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/design-system/package.json packages/design-system/
COPY packages/email/package.json packages/email/
COPY packages/env/package.json packages/env/
COPY packages/notifications/package.json packages/notifications/
COPY packages/observability/package.json packages/observability/
COPY packages/whatsapp/package.json packages/whatsapp/
COPY packages/e2e/package.json packages/e2e/
COPY packages/zero/package.json packages/zero/
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_VALIDATION=true
RUN cd apps/web && bunx --bun vite build

# Stage 3: Production
FROM oven/bun:1.3.10-slim AS production
WORKDIR /app
COPY --from=build /app/apps/web/.output .output
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", ".output/server/index.mjs"]
