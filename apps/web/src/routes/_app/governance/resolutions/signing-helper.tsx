import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { SegmentedChoice } from "@/components/governance/segmented-choice";
import { PageHeader } from "@/components/shared/page-header";

export const Route = createFileRoute(
  "/_app/governance/resolutions/signing-helper"
)({
  component: SigningHelperPage,
  head: () => ({
    meta: [{ title: `Signing helper | ${env.VITE_APP_NAME}` }],
  }),
});

const SCRIPTS =
  "https://raw.githubusercontent.com/proud-indian-ngo/dash/master/services/signing-helper/install";

type Platform = "mac" | "windows";

const PLATFORMS = [
  { label: "Mac", value: "mac" },
  { label: "Windows", value: "windows" },
] as const;

function subscribe() {
  return () => undefined;
}

function detectPlatform(): Platform {
  return navigator.userAgent.includes("Windows") ? "windows" : "mac";
}

function serverPlatform(): Platform {
  return "mac";
}

function Command({ children }: { children: string }) {
  const copy = useEventCallback(() =>
    navigator.clipboard
      .writeText(children)
      .then(() => toast.success("Command copied"))
      .catch(() =>
        toast.error("Couldn't copy. Select the command and copy it manually.")
      )
  );
  return (
    <div className="bg-muted flex items-start gap-2 rounded-md p-3">
      <code className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-all">
        {children}
      </code>
      <Button onClick={copy} size="sm" type="button" variant="outline">
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
        Copy
      </Button>
    </div>
  );
}

function Step({
  children,
  number,
  title,
}: {
  children: ReactNode;
  number: number;
  title: string;
}) {
  return (
    <li className="flex gap-3 px-4 py-4">
      <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

/** How a trustee installs the helper that signs with their DSC token. */
function SigningHelperPage() {
  const detected = useSyncExternalStore(
    subscribe,
    detectPlatform,
    serverPlatform
  );
  const [chosen, setChosen] = useState<Platform | null>(null);
  const platform = chosen ?? detected;
  const handlePlatform = useEventCallback((value: Platform | null) => {
    if (value) {
      setChosen(value);
    }
  });
  const server =
    typeof window === "undefined"
      ? "https://your-dashboard"
      : window.location.origin;

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <SegmentedChoice
            label="Your computer"
            onChange={handlePlatform}
            options={PLATFORMS}
            value={platform}
          />
        }
        description="A small program that lets the dashboard use the DSC token in your laptop. Your PIN stays on your laptop; the dashboard only receives the signature."
        title="Signing helper"
      />
      <ol className="mt-6 divide-y rounded-lg border text-sm leading-relaxed">
        <Step number={1} title="Install your token's driver">
          <p>
            Get the driver (HyperSecu or ePass) from the CA that issued your
            DSC, then check that Adobe Acrobat can see your certificate.
          </p>
        </Step>
        <Step number={2} title="Install the helper">
          {platform === "mac" ? (
            <>
              <p>Open Terminal and paste:</p>
              <Command>{`curl -fsSL ${SCRIPTS}/install-macos.sh | bash -s -- ${server}`}</Command>
            </>
          ) : (
            <>
              <p>Open PowerShell (not as administrator) and paste:</p>
              <Command>{`& ([scriptblock]::Create((iwr -useb ${SCRIPTS}/install-windows.ps1))) -Server ${server}`}</Command>
              <p className="text-muted-foreground">
                Windows may warn that the program is from an unknown publisher
                until the helper is signed; choose More info, then Run anyway.
              </p>
            </>
          )}
          <p className="text-muted-foreground">
            You install it once per laptop.
          </p>
        </Step>
        <Step number={3} title="Set up your DSC">
          <p>
            Plug in your token, open a circular sent to you and choose Set up
            your DSC. Your browser asks to open the signing helper; allow it and
            enter your token PIN. From then on, choose Sign with your DSC on any
            circular.
          </p>
        </Step>
      </ol>
      <p className="text-muted-foreground mt-4 text-sm">
        The helper only signs for this dashboard ({server}). If anything goes
        wrong you can still download the circular, sign it in Acrobat and upload
        it.
      </p>
    </div>
  );
}
