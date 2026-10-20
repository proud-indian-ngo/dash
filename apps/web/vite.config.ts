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
        compressPublicAssets: true,
        rolldownConfig: { onwarn },
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
