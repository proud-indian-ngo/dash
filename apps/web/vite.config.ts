import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type UserConfig } from "vite";
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

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const reactCompiler = await babel({
    presets: [reactCompilerPreset()],
  });

  return {
    plugins: [
      ...devtools(),
      ...tailwindcss(),
      ...tanstackStart(),
      ...nitro({
        preset: "bun",
        serverDir: "server",
        experimental: {
          vite: {},
        },
      }),
      ...react(),
      reactCompiler,
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
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
                  { name: "vendor-react", test: RE_REACT, priority: 20 },
                  { name: "vendor-router", test: RE_ROUTER, priority: 20 },
                  { name: "vendor-zero", test: RE_ZERO, priority: 20 },
                  { name: "vendor-slate", test: RE_SLATE, priority: 25 },
                  { name: "vendor-plate", test: RE_PLATE, priority: 20 },
                  { name: "vendor-table", test: RE_TABLE, priority: 20 },
                  { name: "vendor-form", test: RE_FORM, priority: 20 },
                  { name: "vendor-dnd", test: RE_DND, priority: 20 },
                  { name: "vendor-base-ui", test: RE_BASE_UI, priority: 20 },
                  { name: "vendor-icons", test: RE_ICONS, priority: 20 },
                  { name: "vendor-phone", test: RE_PHONE, priority: 20 },
                  { name: "vendor-recharts", test: RE_RECHARTS, priority: 20 },
                  { name: "vendor-date", test: RE_DATE, priority: 15 },
                  { name: "vendor-auth", test: RE_AUTH, priority: 15 },
                  { name: "vendor-drizzle", test: RE_DRIZZLE, priority: 15 },
                  { name: "vendor-zod", test: RE_ZOD, priority: 15 },
                  { name: "vendor", test: RE_VENDOR, priority: 5 },
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
