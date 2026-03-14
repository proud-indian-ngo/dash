import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import "@pi-dash/env";

export default defineConfig({
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "bun",
      serverDir: "server",
      experimental: {
        tasks: true,
        vite: {},
      },
      scheduledTasks: {
        // Every day at midnight UTC
        "0 0 * * *": ["create-recurring-events"],
      },
    }),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  build: {
    rollupOptions: {
      external: ["bun", "bun:sqlite"],
    },
  },
  optimizeDeps: {
    exclude: ["bun"],
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3001,
    hmr: {
      server: undefined,
      port: 3002,
    },
  },
});
