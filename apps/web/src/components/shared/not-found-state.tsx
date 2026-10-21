import { ArrowLeft01Icon, FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import lockupReversed from "@proudindian/design/logo/svg/pi-lockup-compact-reversed.svg";
import lockup from "@proudindian/design/logo/svg/pi-lockup-compact.svg";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

type IconSvg = typeof FileSearchIcon;

/**
 * A centred "nothing here" block for the page area: a muted icon, a title,
 * one sentence and a way out. Used by unknown URLs, missing records and the
 * error page, so all three read the same.
 */
export function NotFoundState({
  actions,
  className,
  description,
  footer,
  icon = FileSearchIcon,
  iconClassName,
  role = "status",
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description: ReactNode;
  /** Extra detail under the actions, such as an error reference. */
  footer?: ReactNode;
  icon?: IconSvg;
  iconClassName?: string;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 text-center",
        className
      )}
      role={role}
    >
      <div
        className={cn(
          "bg-muted text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-xl",
          iconClassName
        )}
      >
        <HugeiconsIcon className="size-5" icon={icon} strokeWidth={2} />
      </div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      <div className="text-muted-foreground mt-1.5 text-sm text-pretty">
        {description}
      </div>
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
      {footer ? (
        <div className="text-muted-foreground mt-5 w-full text-xs">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** A missing record inside the app: name it and link back to its list. */
export function RecordNotFound({
  backLabel,
  backTo,
  noun,
}: {
  backLabel: string;
  backTo: LinkProps["to"];
  noun: string;
}) {
  return (
    <NotFoundState
      actions={
        <Button nativeButton={false} render={<Link to={backTo} />}>
          <HugeiconsIcon
            data-icon="inline-start"
            icon={ArrowLeft01Icon}
            strokeWidth={2}
          />
          {backLabel}
        </Button>
      }
      description="It may have been deleted, or you don't have access to it."
      title={`${noun} not found`}
    />
  );
}

/**
 * Full-window frame for states outside the app layout (signed out, or the
 * whole app failed): the compact lockup on top, the content centred below.
 */
export function StandalonePage({
  children,
  logoHref = "/",
}: {
  children: ReactNode;
  /** Where the lockup leads; public pages point it at the website, not sign-in. */
  logoHref?: string;
}) {
  return (
    <main
      className="flex min-h-svh flex-col p-6 md:p-10"
      id="main"
      tabIndex={-1}
    >
      <a aria-label="Proud Indian" className="self-center" href={logoHref}>
        <img alt="" className="h-6 w-auto dark:hidden" src={lockup} />
        <img
          alt=""
          className="hidden h-6 w-auto dark:block"
          src={lockupReversed}
        />
      </a>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </main>
  );
}
