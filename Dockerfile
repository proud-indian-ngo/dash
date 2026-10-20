# PostHog CLI for the source map upload, pinned with checksums from its GitHub release
FROM oven/bun:1.4.3-slim AS posthog-cli
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      arm64) target=aarch64-unknown-linux-gnu; sha=eb3d4135fdeac40d7fe8f5706830216d1220d3d20a600f0afa6a0621b6b437a8 ;; \
      amd64) target=x86_64-unknown-linux-gnu; sha=29f2d4409f08205bab7d52f9cc919e964ea2c867ec568b3acdd9ee3eb4149c3d ;; \
      *) echo "posthog-cli: unsupported architecture $TARGETARCH"; exit 1 ;; \
    esac; \
    bun -e "await Bun.write('/tmp/cli.tar.gz', await fetch('https://github.com/PostHog/posthog/releases/download/posthog-cli/v0.18.10/posthog-cli-$target.tar.gz'))" && \
    echo "$sha  /tmp/cli.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/cli.tar.gz -C /tmp && \
    mv "/tmp/posthog-cli-$target/posthog-cli" /usr/local/bin/posthog-cli && \
    rm -rf /tmp/cli.tar.gz "/tmp/posthog-cli-$target" && \
    posthog-cli --version

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
# Client source maps go to PostHog Error Tracking, best effort: a missing key,
# project ID or release skips the upload, and a failed upload leaves that
# release unsymbolicated. The personal API key exists only inside this RUN.
# Finalization deletes every map and recreates existing compressed JavaScript
# after the CLI has had its chance to rewrite the chunks.
ARG POSTHOG_CLI_PROJECT_ID
ARG POSTHOG_CLI_HOST=https://us.posthog.com
RUN --mount=type=secret,id=posthog_cli_api_key,required=false \
    --mount=type=bind,from=posthog-cli,source=/usr/local/bin/posthog-cli,target=/usr/local/bin/posthog-cli \
    release=$(cat /app/release); \
    key=$(cat /run/secrets/posthog_cli_api_key 2>/dev/null || true); \
    if [ -z "$key" ] || [ -z "$POSTHOG_CLI_PROJECT_ID" ] || [ -z "$release" ]; then \
      echo "source maps: upload skipped, needs the posthog_cli_api_key secret, POSTHOG_CLI_PROJECT_ID and a release"; \
    elif POSTHOG_CLI_API_KEY="$key" posthog-cli --host "$POSTHOG_CLI_HOST" sourcemap process \
        --directory apps/web/.output/public --release-name pi-dash --release-version "$release"; then \
      echo "source maps: uploaded for release $release"; \
    else \
      echo "source maps: upload failed, release $release ships unsymbolicated"; \
    fi; \
    bun apps/web/scripts/finalize-public-assets.ts apps/web/.output/public

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
