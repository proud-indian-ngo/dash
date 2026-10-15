import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { DonationReceiptsSection } from "@/components/settings/sections/donation-receipts-section";
import { DonationsReturnSection } from "@/components/settings/sections/donations-return-section";
import { OrgAccountsSection } from "@/components/settings/sections/org-accounts-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/org-accounts";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/org-accounts")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.view"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: OrgAccountsSettingsPage,
});

function OrgAccountsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <div className="flex flex-col gap-6">
        <OrgAccountsSection />
        <DonationsReturnSection />
        <DonationReceiptsSection />
      </div>
    </SettingsPage>
  );
}
