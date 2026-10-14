import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { PayoutImportWizard } from "@/components/income/payout/payout-import-wizard";
import { PageHeader } from "@/components/shared/page-header";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/income/payout/import")({
  beforeLoad: ({ context }) => {
    assertPermission(context, "donors.manage");
    assertPermission(context, "finance.manage");
  },
  component: PayoutImportPage,
  head: () => ({
    meta: [{ title: `Import give.do payout | ${env.VITE_APP_NAME}` }],
  }),
});

function PayoutImportPage() {
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="Review a give.do payout, link its donations and record the net amount paid into the bank."
        title="Import give.do payout"
      />
      <div className="mt-6">
        <PayoutImportWizard />
      </div>
    </div>
  );
}
