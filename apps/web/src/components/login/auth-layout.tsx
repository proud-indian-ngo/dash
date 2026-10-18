import lockupReversed from "@proudindian/design/logo/svg/pi-lockup-compact-reversed.svg";
import lockup from "@proudindian/design/logo/svg/pi-lockup-compact.svg";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  panel: ReactNode;
}

/**
 * Sign-in screens: the form beside a quiet info-wash panel that carries the
 * welcome text, sign-up steps or the session being joined. Phones show the
 * form only.
 */
export function AuthLayout({ children, panel }: AuthLayoutProps) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2" id="main" tabIndex={-1}>
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <a aria-label="Proud Indian" className="self-start" href="/">
          <img alt="" className="h-6 w-auto dark:hidden" src={lockup} />
          <img
            alt=""
            className="hidden h-6 w-auto dark:block"
            src={lockupReversed}
          />
        </a>
        {/* Phones top-align the form so no empty band sits above the title */}
        <div className="flex flex-1 items-start justify-center pt-6 md:items-center md:pt-0">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="bg-info/10 dark:bg-info/14 text-foreground hidden lg:flex lg:items-center lg:justify-center lg:p-10">
        {panel}
      </div>
    </main>
  );
}
