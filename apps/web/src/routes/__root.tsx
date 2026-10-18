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
import { reloadForChunkError } from "@/lib/chunk-load-error";
import { watchForNewVersion } from "@/lib/new-version";
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

const loadClientLogger = () => import("@/lib/client-logger");
const loadPostHog = () => import("@/lib/posthog");

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
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
        name: "viewport",
      },
      {
        title: env.VITE_APP_NAME,
      },
      {
        content: env.VITE_APP_NAME,
        name: "apple-mobile-web-app-title",
      },
      // Browser chrome matches the page background in each scheme.
      {
        content: "#ffffff",
        media: "(prefers-color-scheme: light)",
        name: "theme-color",
      },
      {
        content: "#161618",
        media: "(prefers-color-scheme: dark)",
        name: "theme-color",
      },
    ],
  }),
});

function RootDocument() {
  useEffect(() => {
    // Vite's preload helper fails when a deploy removed the chunks this tab
    // was built against; reload onto the current build. The error still
    // propagates (no preventDefault) so a blocked reload reaches the boundary
    // as a recognisable chunk error rather than an undefined module.
    const onPreloadError = (event: Event) => {
      reloadForChunkError((event as Event & { payload?: unknown }).payload);
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    const stopWatchingVersion = watchForNewVersion();
    loadClientLogger()
      .then(({ initClientLogger }) => initClientLogger())
      .catch(() => {
        // Non-critical
      });
    loadPostHog()
      .then(({ initPostHog }) => initPostHog())
      .catch(() => {
        // Non-critical
      });
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      stopWatchingVersion();
    };
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* React Scan disabled while debugging local browser tests. */}
        <HeadContent />
      </head>
      <body>
        <a
          className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
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
            {/* Wait before the first tooltip; once one is showing, neighbours open instantly. */}
            <TooltipProvider delay={400}>
              <NuqsAdapter>
                <ZeroInit>
                  <Outlet />
                </ZeroInit>
              </NuqsAdapter>
              <Toaster
                mobileOffset={{
                  bottom: "calc(1rem + var(--mobile-tab-bar-height, 0px))",
                }}
                richColors
              />
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
