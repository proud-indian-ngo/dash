import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Rolldown, type UserConfig } from "vite";

import { apiMediaDevMiddleware } from "./src/lib/dev/api-media-dev-middleware.ts";
import { kalakritiPdfAssets } from "./src/lib/dev/kalakriti-pdf-assets.ts";
import { pdfjsAssets } from "./src/lib/dev/pdfjs-assets.ts";
import { appReactCompilerPreset } from "./src/lib/dev/react-compiler-preset.ts";
import "@pi-dash/env";

const onLog: NonNullable<Rolldown.InputOptions["onLog"]> = (
  level,
  log,
  defaultHandler
) => {
  // This app uses SSR, not RSC; client directives have no bundle semantics.
  // The compiler runtime's opt-out has already served its purpose by bundling.
  if (
    level === "warn" &&
    log.code === "MODULE_LEVEL_DIRECTIVE" &&
    (log.message.includes('"use client"') ||
      (log.message.includes("node_modules/") &&
        log.message.includes('"use no memo"')))
  ) {
    return;
  }
  defaultHandler(level, log);
};

// Client source maps are hidden: the Docker build uploads them to PostHog and
// deletes them before the runtime image. Nitro lists every public file in its
// asset manifest, and a listed but deleted file answers 500, so keep maps out
// of the manifest and let the static handler answer 404. The upload also
// rewrites every chunk after Nitro recorded its size, then the Docker build
// recreates existing compressed variants. Drop the stale sizes for every JS
// representation. Keep the ETag: injection and recompression are deterministic
// per chunk, so it still identifies the served bytes, and Cloudflare
// revalidation relies on it.
const PUBLIC_ASSETS_PREFIX = "export default ";
let publicAssetsRewritten = false;
const rewritePublicAssets: Rolldown.Plugin = {
  name: "pi-dash:rewrite-public-assets",
  buildStart() {
    publicAssetsRewritten = false;
  },
  transform: {
    filter: { id: /^#nitro\/virtual\/public-assets-data$/ },
    handler(code) {
      if (!code.startsWith(PUBLIC_ASSETS_PREFIX)) {
        throw new Error("Unexpected Nitro public asset manifest format");
      }
      const assets: Record<string, Record<string, unknown>> = JSON.parse(
        code.slice(PUBLIC_ASSETS_PREFIX.length).replace(/;\s*$/, "")
      );
      for (const [id, asset] of Object.entries(assets)) {
        if (/\.map(?:\.br|\.gz|\.zst)?$/.test(id)) {
          delete assets[id];
        } else if (/\.js(?:\.br|\.gz|\.zst)?$/.test(id)) {
          delete asset.size;
        }
      }
      publicAssetsRewritten = true;
      return `${PUBLIC_ASSETS_PREFIX}${JSON.stringify(assets)};`;
    },
  },
  generateBundle() {
    if (!publicAssetsRewritten) {
      throw new Error("Nitro public asset manifest was not rewritten");
    }
  },
};

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const reactCompiler = await babel({
    presets: [appReactCompilerPreset()],
  });
  // One ID per build, served by /api/version so open tabs can notice a
  // deploy (see lib/build-id.ts).
  const buildId = mode === "production" ? Date.now().toString(36) : "dev";
  // E2E builds skip source maps and precompressed assets: tests read
  // neither, and both slow the build and the CI artifact.
  const e2eBuild = process.env.VITE_E2E === "true";

  return {
    build: {
      chunkSizeWarningLimit: 2300,
      rolldownOptions: {
        onLog,
        checks: {
          pluginTimings: false,
        },
        external: ["bun", "bun:sqlite"],
      },
    },
    environments: {
      client: {
        build: {
          sourcemap: e2eBuild ? false : "hidden",
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  {
                    name: "startup",
                    test: /\/src\/router\.tsx(?:\?|$)/,
                    priority: 20,
                  },
                  {
                    name: "app-shell",
                    test: /\/src\/routes\/_app\.tsx(?:\?|$)/,
                    priority: 10,
                  },
                ],
              },
            },
          },
        },
      },
    },
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    optimizeDeps: {
      exclude: ["bun"],
      include: ["use-sync-external-store/shim/with-selector"],
    },
    plugins: [
      kalakritiPdfAssets(),
      pdfjsAssets(),
      ...devtools(),
      ...tailwindcss(),
      ...tanstackStart({
        router: {
          routeFileIgnorePattern: "\\.test\\.[tj]sx?$",
          codeSplittingOptions: {
            defaultBehavior: [
              ["loader", "component"],
              ["errorComponent"],
              ["notFoundComponent"],
            ],
          },
        },
        server: {
          build: { inlineCss: true },
        },
      }),
      apiMediaDevMiddleware,
      ...nitro({
        compressPublicAssets: !e2eBuild,
        rolldownConfig: { onLog, plugins: [rewritePublicAssets] },
        experimental: {
          vite: {},
        },
        preset: "bun",
        serverDir: "server",
      }),
      ...react(),
      reactCompiler,
    ],
    resolve: {
      alias: {
        ...(mode === "production" && {
          agentation: `${import.meta.dirname}/src/stubs/empty.ts`,
        }),
      },
      tsconfigPaths: true,
    },
    server: {
      allowedHosts: process.env.AMP_ORB ? true : ["host.docker.internal"],
      port: Number(process.env.DEV_WEB_PORT) || 3001,
    },
  };
});
