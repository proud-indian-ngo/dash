import { Toaster } from "@pi-dash/design-system/components/ui/sonner";
import { TooltipProvider } from "@pi-dash/design-system/components/ui/tooltip";
import { ThemeProvider } from "@pi-dash/design-system/lib/theme-provider";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";
import { ZeroInit } from "@/components/zero-init";
import type { RouterContext } from "@/router";
import appCss from "../index.css?url";

const LazyDevTools = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-tools"))
  : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  // Typically we don't need the user immediately in landing pages.
  // For protected routes with loader data, see /_app.tsx
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Proud Indian Dashboard",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {import.meta.env.DEV && (
          <script src="https://unpkg.com/react-scan@0.4.3/dist/auto.global.js" />
        )}
        <HeadContent />
      </head>
      <body>
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4 focus:text-foreground"
          href="#main"
        >
          Skip to content
        </a>
        <ScriptOnce>
          {/* Apply theme early to avoid FOUC */}
          {`document.documentElement.classList.toggle(
            'dark',
            localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
            )`}
        </ScriptOnce>
        <ThemeProvider>
          <TooltipProvider>
            <NuqsAdapter>
              <ZeroInit>
                <Outlet />
              </ZeroInit>
            </NuqsAdapter>
            <Toaster richColors />
          </TooltipProvider>
        </ThemeProvider>
        {import.meta.env.DEV && <LazyDevTools />}
        <Scripts />
      </body>
    </html>
  );
}
