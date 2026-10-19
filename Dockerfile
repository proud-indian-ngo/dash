# Shared dependencies and source for the web build and migrator
FROM oven/bun:1.4.3-slim AS source
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
# Skip lifecycle scripts: @rocicorp/zero-sqlite3 is a trustedDependency whose
# install script compiles a native addon (needs Python/g++). Web vite build and
# the migrator do not load it — production zero-cache is the rocicorp/zero image.
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .

FROM source AS build
ARG VITE_ZERO_URL
ARG VITE_CDN_URL
ARG VITE_IMMICH_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_APP_ENV
ENV SKIP_VALIDATION=true
ENV VITE_ZERO_URL=$VITE_ZERO_URL
ENV VITE_CDN_URL=$VITE_CDN_URL
ENV VITE_IMMICH_URL=$VITE_IMMICH_URL
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV VITE_APP_ENV=$VITE_APP_ENV
# Release = the commit SHA, read from .git without a git binary (Dokploy clones
# with --depth 1). Without .git the release stays empty and the build continues.
RUN head=$(cat .git/HEAD 2>/dev/null || true); \
    case "$head" in \
      "ref: "*) ref=${head#ref: }; \
        release=$(cat ".git/$ref" 2>/dev/null || grep " $ref\$" .git/packed-refs 2>/dev/null | cut -d' ' -f1) ;; \
      *) release=$head ;; \
    esac; \
    echo "$release" | grep -Eq '^[0-9a-f]{40}$' || release=; \
    echo "release: ${release:-none}"; \
    printf '%s' "$release" > /app/release; \
    cd apps/web && VITE_APP_RELEASE="$release" bunx --bun vite build

# Stage 2: Migrator (runs pending DB migrations)
FROM oven/bun:1.4.3-slim AS migrator
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY --from=source /app/node_modules node_modules
COPY --from=source /app/packages/db packages/db
COPY --from=source /app/packages/zero packages/zero
COPY --from=source /app/package.json package.json
CMD ["sh", "-c", "bun run packages/db/scripts/migrate.ts && bun run packages/zero/scripts/prepare-publication.ts"]

# Stage 3: Production
FROM oven/bun:1.4.3-slim AS production
ENV TZ=Asia/Kolkata
WORKDIR /app
COPY --from=build /app/apps/web/.output .output
COPY --from=build /app/release release
# SSR chunks use runtime require("react") via CJS interop (use-sync-external-store)
RUN bun add react@19
EXPOSE 3000
ENV NODE_ENV=production
CMD ["sh", "-c", "APP_RELEASE=\"${APP_RELEASE:-$(cat release)}\" exec bun run .output/server/index.mjs"]
