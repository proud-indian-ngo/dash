import { Toaster } from "@pi-dash/design-system/components/ui/sonner";
import { TooltipProvider } from "@pi-dash/design-system/components/ui/tooltip";
import { ThemeProvider } from "@pi-dash/design-system/lib/theme-provider";
import { env } from "@pi-dash/env/web";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { Agentation } from "agentation";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy, Suspense, useEffect } from "react";
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
  ? lazy(() =>
      import("@/components/dev-tools").then((m) => ({ default: m.DevTools }))
    )
  : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  // Typically we don't need the user immediately in landing pages.
  // For protected routes with loader data, see /_app.tsx
  head: () => ({
    links: import.meta.env.DEV
      ? []
      : [
          {
            href: appCss,
            rel: "stylesheet",
          },
          {
            href: "/favicon-96x96.png",
            rel: "icon",
            sizes: "96x96",
            type: "image/png",
          },
          {
            href: "/favicon.svg",
            rel: "icon",
            type: "image/svg+xml",
          },
          {
            href: "/favicon.ico",
            rel: "shortcut icon",
          },
          {
            href: "/apple-touch-icon.png",
            rel: "apple-touch-icon",
            sizes: "180x180",
          },
          {
            href: "/site.webmanifest",
            rel: "manifest",
          },
        ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        title: env.VITE_APP_NAME,
      },
      {
        content: env.VITE_APP_NAME,
        name: "apple-mobile-web-app-title",
      },
    ],
  }),
});

function RootDocument() {
  useEffect(() => {
    import("@/lib/client-logger")
      .then(({ initClientLogger }) => initClientLogger())
      .catch(() => {
        // Non-critical
      });
    import("@/lib/posthog")
      .then(({ initPostHog }) => initPostHog())
      .catch(() => {
        // Non-critical
      });
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* React Scan disabled while debugging local browser tests. */}
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
        {Boolean(import.meta.env.DEV) && (
          <Suspense>
            <LazyDevTools />
          </Suspense>
        )}
        {Boolean(import.meta.env.DEV && !import.meta.env.VITE_E2E) && (
          <Agentation />
        )}
        <Scripts />
      </body>
    </html>
  );
}
