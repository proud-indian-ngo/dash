import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Rolldown, type UserConfig } from "vite";

import { apiMediaDevMiddleware } from "./src/lib/dev/api-media-dev-middleware.ts";
import { kalakritiPdfAssets } from "./src/lib/dev/kalakriti-pdf-assets.ts";
import { appReactCompilerPreset } from "./src/lib/dev/react-compiler-preset.ts";
import "@pi-dash/env";

const RE_REACT = /node_modules[\\/](react|react-dom|scheduler)\//;
const RE_ROUTER = /node_modules[\\/]@tanstack[\\/](react-router|history)\//;
const RE_ZERO = /node_modules[\\/]@rocicorp[\\/]zero\//;
const RE_SLATE =
  /node_modules[\\/](slate|slate-dom|slate-react|slate-hyperscript)\//;
const RE_PLATE = /node_modules[\\/](@platejs[\\/][^\\/]+|platejs)\//;
const RE_TABLE = /node_modules[\\/]@tanstack[\\/]react-table\//;
const RE_FORM = /node_modules[\\/]@tanstack[\\/](react-form|form-core)\//;
const RE_DND = /node_modules[\\/]@dnd-kit[\\/](core|sortable)\//;
const RE_BASE_UI =
  /node_modules[\\/](@base-ui[\\/][^\\/]+|@floating-ui[\\/][^\\/]+)\//;
const RE_ICONS =
  /node_modules[\\/](@hugeicons[\\/][^\\/]+|country-flag-icons)\//;
const RE_PHONE =
  /node_modules[\\/](libphonenumber-js|react-phone-number-input)\//;
const RE_DATE = /node_modules[\\/](date-fns|react-day-picker)\//;
const RE_AUTH = /node_modules[\\/]better-auth\//;
const RE_DRIZZLE = /node_modules[\\/]drizzle-orm\//;
const RE_ZOD = /node_modules[\\/]zod\//;
const RE_RECHARTS =
  /node_modules[\\/](recharts|react-redux|@reduxjs[\\/]toolkit|redux|redux-thunk|reselect|immer|use-sync-external-store|victory-vendor|decimal\.js-light|eventemitter3)\//;

const onwarn: Rolldown.WarningHandlerWithDefault = (
  warning,
  defaultHandler
) => {
  // This app uses SSR, not RSC; client directives have no bundle semantics.
  // The compiler runtime's opt-out has already served its purpose by bundling.
  if (
    warning.code === "MODULE_LEVEL_DIRECTIVE" &&
    (warning.message.includes('"use client"') ||
      (warning.message.includes("node_modules/") &&
        warning.message.includes('"use no memo"')))
  ) {
    return;
  }
  defaultHandler(warning);
};

// Client source maps are hidden: the Docker build uploads them to PostHog and
// deletes them before the runtime image. Nitro lists every public file in its
// asset manifest, and a listed but deleted file answers 500, so keep maps out
// of the manifest and let the static handler answer 404. The upload also
// rewrites every chunk after Nitro recorded its size and ETag, so drop both for
// `.js` files rather than serve a stale Content-Length or ETag.
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
        if (id.endsWith(".map")) {
          delete assets[id];
        } else if (id.endsWith(".js")) {
          delete asset.size;
          delete asset.etag;
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

  return {
    build: {
      chunkSizeWarningLimit: 2300,
      rolldownOptions: {
        onwarn,
        checks: {
          pluginTimings: false,
        },
        external: ["bun", "bun:sqlite"],
      },
    },
    environments: {
      client: {
        build: {
          sourcemap: "hidden",
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  { name: "vendor-react", priority: 20, test: RE_REACT },
                  { name: "vendor-router", priority: 20, test: RE_ROUTER },
                  { name: "vendor-zero", priority: 20, test: RE_ZERO },
                  { name: "vendor-slate", priority: 25, test: RE_SLATE },
                  { name: "vendor-plate", priority: 20, test: RE_PLATE },
                  { name: "vendor-table", priority: 20, test: RE_TABLE },
                  { name: "vendor-form", priority: 20, test: RE_FORM },
                  { name: "vendor-dnd", priority: 20, test: RE_DND },
                  { name: "vendor-base-ui", priority: 20, test: RE_BASE_UI },
                  { name: "vendor-icons", priority: 20, test: RE_ICONS },
                  { name: "vendor-phone", priority: 20, test: RE_PHONE },
                  { name: "vendor-recharts", priority: 20, test: RE_RECHARTS },
                  { name: "vendor-date", priority: 15, test: RE_DATE },
                  { name: "vendor-auth", priority: 15, test: RE_AUTH },
                  { name: "vendor-drizzle", priority: 15, test: RE_DRIZZLE },
                  { name: "vendor-zod", priority: 15, test: RE_ZOD },
                  // Let other dependencies follow their route/dynamic imports.
                  // A catch-all vendor group pulls lazy features into the entry.
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
      ...devtools(),
      ...tailwindcss(),
      ...tanstackStart({
        router: { routeFileIgnorePattern: "\\.test\\.[tj]sx?$" },
      }),
      apiMediaDevMiddleware,
      ...nitro({
        rolldownConfig: { onwarn, plugins: [rewritePublicAssets] },
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
