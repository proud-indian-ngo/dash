import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/shared/page-header";

export const Route = createFileRoute("/_app/governance/signing-helper")({
  component: SigningHelperPage,
  head: () => ({
    meta: [{ title: `Signing helper | ${env.VITE_APP_NAME}` }],
  }),
});

const SCRIPTS =
  "https://raw.githubusercontent.com/proud-indian-ngo/dash/master/services/signing-helper/install";

function Command({ children }: { children: string }) {
  return (
    <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/** How a trustee installs the helper that signs with their DSC token. */
function SigningHelperPage() {
  const server =
    typeof window === "undefined"
      ? "https://your-pi-dash"
      : window.location.origin;
  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <PageHeader
        description="A small program that lets pi-dash use the DSC token in your laptop. Your PIN stays on your laptop; pi-dash only receives the signature."
        title="Signing helper"
      />
      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Before you start</h2>
          <p>
            Install your token's driver (HyperSecu or ePass, from the CA that
            issued your DSC) and check that Adobe Acrobat can see your
            certificate. You install the helper once per laptop.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Mac</h2>
          <p>Open Terminal and paste:</p>
          <Command>{`curl -fsSL ${SCRIPTS}/install-macos.sh | bash -s -- ${server}`}</Command>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Windows</h2>
          <p>Open PowerShell (not as administrator) and paste:</p>
          <Command>{`& ([scriptblock]::Create((iwr -useb ${SCRIPTS}/install-windows.ps1))) -Server ${server}`}</Command>
          <p className="text-muted-foreground">
            Windows may warn that the program is from an unknown publisher until
            the helper is signed; choose More info, then Run anyway.
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Then</h2>
          <ol className="list-decimal pl-5">
            <li>Plug in your DSC token.</li>
            <li>
              Open a circular sent to you and choose Set up your DSC. Your
              browser asks to open the pi-dash signing helper; allow it and
              enter your token PIN.
            </li>
            <li>From then on, choose Sign with your DSC on any circular.</li>
          </ol>
          <p className="text-muted-foreground">
            The helper only signs for this pi-dash ({server}). If anything goes
            wrong you can still download the circular, sign it in Acrobat and
            upload it.
          </p>
        </section>
      </div>
    </div>
  );
}
