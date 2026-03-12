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
import { Agentation } from "agentation";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy, useEffect } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ZeroInit } from "@/components/zero-init";
import type { RouterContext } from "@/router";
// In dev, Vite injects CSS via HMR — no <link> needed (and avoids ?t= hydration mismatch).
// In prod, we need an explicit <link> for SSR.
import appCss from "../index.css?url";

if (import.meta.env.DEV) {
  import("../index.css");
}

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
    links: import.meta.env.DEV
      ? []
      : [
          {
            rel: "stylesheet",
            href: appCss,
          },
        ],
  }),

  component: RootDocument,
});

function RootDocument() {
  useEffect(() => {
    import("@/lib/client-logger")
      .then(({ initClientLogger }) => initClientLogger())
      .catch(() => {
        // Logger init is non-critical
      });
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {import.meta.env.DEV && !import.meta.env.VITE_E2E && (
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
          <AppErrorBoundary level="root">
            <TooltipProvider>
              <NuqsAdapter>
                <ZeroInit>
                  <Outlet />
                </ZeroInit>
              </NuqsAdapter>
              <Toaster richColors />
            </TooltipProvider>
          </AppErrorBoundary>
        </ThemeProvider>
        {import.meta.env.DEV && <LazyDevTools />}
        {process.env.NODE_ENV === "development" &&
          !import.meta.env.VITE_E2E && <Agentation />}
        <Scripts />
      </body>
    </html>
  );
}
