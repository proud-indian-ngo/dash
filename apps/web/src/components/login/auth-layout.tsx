import { env } from "@pi-dash/env/web";
import type { ReactNode } from "react";
import { DotGridCanvas } from "./dot-grid-canvas";

interface AuthLayoutProps {
  children: ReactNode;
  panel: ReactNode;
}

export function AuthLayout({ children, panel }: AuthLayoutProps) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2" id="main" tabIndex={-1}>
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2">
          <img
            alt={env.VITE_APP_NAME}
            className="size-8"
            height={32}
            src="/favicon-96x96.png"
            width={32}
          />
          <span className="font-semibold text-lg">{env.VITE_APP_NAME}</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div
        className="relative hidden overflow-hidden text-sidebar-foreground lg:flex lg:items-center lg:justify-center lg:p-10"
        style={{
          background:
            "linear-gradient(to bottom right, var(--auth-panel-from), var(--auth-panel-to))",
        }}
      >
        <DotGridCanvas />
        <div className="relative z-10">{panel}</div>
      </div>
    </main>
  );
}
