import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import {
  defineConfig,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from "vite";
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
const RE_VENDOR = /node_modules/;

const apiPath = /^\/api\//;

const apiImageDevMiddleware: Plugin = {
  apply: "serve",
  configureServer(server: ViteDevServer) {
    server.middlewares.use((request, _response, next) => {
      if (
        request.url &&
        request.headers["sec-fetch-dest"] === "image" &&
        apiPath.test(request.url)
      ) {
        request.headers["sec-fetch-dest"] = "empty";
      }
      next();
    });
  },
  enforce: "pre",
  name: "api-image-dev-middleware",
};

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const reactCompiler = await babel({
    presets: [reactCompilerPreset()],
  });

  return {
    build: {
      chunkSizeWarningLimit: 2300,
      rolldownOptions: {
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
                  { name: "vendor", priority: 5, test: RE_VENDOR },
                ],
              },
            },
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ["bun"],
      include: ["use-sync-external-store/shim/with-selector"],
    },
    plugins: [
      ...devtools(),
      ...tailwindcss(),
      ...tanstackStart(),
      apiImageDevMiddleware,
      ...nitro({
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
      allowedHosts: ["host.docker.internal"],
      port: Number(process.env.DEV_WEB_PORT) || 3001,
    },
  };
});
