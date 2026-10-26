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

/**
 * The latest KeySeal helper release's downloads, which each release also
 * publishes under these fixed names; installed helpers update themselves.
 */
const LATEST = "https://github.com/somus/keyseal/releases/latest/download";
const DOWNLOADS = {
  mac: `${LATEST}/keyseal-macos-universal.dmg`,
  windows: `${LATEST}/keyseal-windows-x64.zip`,
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
              Open the downloaded file, drag KeySeal into Applications and open
              it once from there. The first time, your Mac says it can't verify
              KeySeal, because the helper isn't from a paid Apple developer yet;
              choose Done, then open System Settings, Privacy & Security, and
              under Security choose Open Anyway, then Open.
            </p>
          ) : (
            <p>
              If your browser says the file isn't commonly downloaded, choose
              Keep in its downloads list. Unzip the downloaded file and open
              install.cmd inside it. Windows says it protected your PC, because
              the helper isn't from a paid publisher; choose More info, then Run
              anyway.
            </p>
          )}
          <p className="text-muted-foreground">
            You install it once per laptop. It keeps itself up to date. It
            replaces the earlier Proud Indian Signing helper, which no longer
            opens. Removing that one is optional: on a Mac, move Proud Indian
            Signing from Applications to the Bin; on Windows, delete the
            %LOCALAPPDATA%\pidash-sign folder, then in Registry Editor delete
            the HKEY_CURRENT_USER\Software\Classes\pidash-sign key.
          </p>
        </Step>
        <Step number={3} title="Set up your DSC">
          <p>
            Plug in your token, open a circular sent to you and choose Set up
            your DSC. Your browser asks to open KeySeal; allow it. The first
            time, KeySeal asks whether to trust the dashboard's address; check
            that it is the dashboard's, then choose your certificate. From then
            on, choose Sign with your DSC on any circular and enter your token
            PIN in KeySeal.
          </p>
        </Step>
      </ol>
      <p className="text-muted-foreground mt-4 text-sm">
        The helper shows which site asks for each signature and what it signs.
        If anything goes wrong you can still download the circular, sign it in
        Acrobat and upload it.
      </p>
    </div>
  );
}
