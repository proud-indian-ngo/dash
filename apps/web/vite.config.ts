import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import "@pi-dash/env";

export default defineConfig({
  plugins: [
    devtools(),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "bun",
      experimental: {
        tasks: true,
        vite: {},
      },
      scheduledTasks: {
        // Every day at midnight UTC
        "0 0 * * *": ["create-recurring-events"],
      },
    }),
    viteReact({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  server: {
    port: 3001,
  },
});
