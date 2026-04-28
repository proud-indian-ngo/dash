# Stage 1: Install dependencies and build
FROM oven/bun:1.3.13-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/design-system/package.json packages/design-system/
COPY packages/editor/package.json packages/editor/
COPY packages/email/package.json packages/email/
COPY packages/env/package.json packages/env/
COPY packages/pdf/package.json packages/pdf/
COPY packages/jobs/package.json packages/jobs/
COPY packages/notifications/package.json packages/notifications/
COPY packages/observability/package.json packages/observability/
COPY packages/shared/package.json packages/shared/
COPY packages/whatsapp/package.json packages/whatsapp/
COPY packages/e2e/package.json packages/e2e/
COPY packages/zero/package.json packages/zero/
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_ZERO_URL
ARG VITE_CDN_URL
ARG VITE_IMMICH_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV SKIP_VALIDATION=true
ENV VITE_ZERO_URL=$VITE_ZERO_URL
ENV VITE_CDN_URL=$VITE_CDN_URL
ENV VITE_IMMICH_URL=$VITE_IMMICH_URL
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ARG POSTHOG_PERSONAL_API_KEY
ARG POSTHOG_PROJECT_ID
ENV POSTHOG_PERSONAL_API_KEY=$POSTHOG_PERSONAL_API_KEY
ENV POSTHOG_PROJECT_ID=$POSTHOG_PROJECT_ID
RUN cd apps/web && bunx --bun vite build
RUN if [ -n "$POSTHOG_PERSONAL_API_KEY" ] && [ -n "$POSTHOG_PROJECT_ID" ]; then \
      export POSTHOG_CLI_API_KEY="$POSTHOG_PERSONAL_API_KEY" && \
      export POSTHOG_CLI_PROJECT_ID="$POSTHOG_PROJECT_ID" && \
      export POSTHOG_CLI_HOST="${POSTHOG_CLI_HOST:-https://us.posthog.com}" && \
      bunx posthog-cli sourcemap inject --directory apps/web/.output/public && \
      if ! grep -rq 'chunkId' apps/web/.output/public/assets/; then \
        echo "ERROR: posthog-cli inject did not write chunkId to JS files" && exit 1; \
      fi && \
      echo "Verified: chunkId found in JS files" && \
      bunx posthog-cli sourcemap upload --directory apps/web/.output/public --delete-after; \
    fi

# Stage 2: Migrator (runs pending DB migrations)
FROM oven/bun:1.3.13-slim AS migrator
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/db packages/db
COPY --from=build /app/package.json package.json
CMD ["bun", "run", "packages/db/scripts/migrate.ts"]

# Stage 3: Production
FROM oven/bun:1.3.13-slim AS production
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY --from=build /app/apps/web/.output .output
# SSR chunks use runtime require("react") via CJS interop (use-sync-external-store)
RUN bun add react@19
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", ".output/server/index.mjs"]
