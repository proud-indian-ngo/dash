import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buttonVariants } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";

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

/** Every helper release is marked latest (see the signing-helper workflow). */
const DOWNLOADS = {
  mac: "https://github.com/proud-indian-ngo/dash/releases/latest/download/pidash-sign-macos.dmg",
  windows:
    "https://github.com/proud-indian-ngo/dash/releases/latest/download/pidash-sign-windows-x64.exe",
} as const;

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

function DownloadButton({ platform }: { platform: Platform }) {
  return (
    <a
      className={buttonVariants({
        className: "self-start",
        size: "sm",
        variant: "outline",
      })}
      download
      href={DOWNLOADS[platform]}
    >
      <HugeiconsIcon className="size-4" icon={Download04Icon} strokeWidth={2} />
      {platform === "mac" ? "Download for Mac" : "Download for Windows"}
    </a>
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
          <DownloadButton platform={platform} />
          {platform === "mac" ? (
            <p>
              Open the downloaded file and drag Proud Indian Signing into
              Applications. If macOS doesn't let you (your account isn't an
              administrator), put it in the Applications folder inside your home
              folder instead. Then open it once from there: the first time,
              macOS says it can't check the app. Choose Done, open System
              Settings, then Privacy &amp; Security, choose Open Anyway next to
              Proud Indian Signing, and confirm.
            </p>
          ) : (
            <p>
              If your browser says the file isn't commonly downloaded, choose
              Keep in its downloads list. Open the downloaded file. Windows says
              it protected your PC, because the helper isn't from a paid
              publisher; choose More info, then Run anyway. The helper installs
              itself for your Windows account and says when it's ready.
            </p>
          )}
          <p className="text-muted-foreground">
            You install it once per laptop. It keeps itself up to date: when a
            new version is out, it updates the next time you sign.
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
        The helper only signs for the Proud Indian dashboard. If anything goes
        wrong you can still download the circular, sign it in Acrobat and upload
        it.
      </p>
    </div>
  );
}
