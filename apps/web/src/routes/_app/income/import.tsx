import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ImportWizard } from "@/components/income/import/import-wizard";
import { PageHeader } from "@/components/shared/page-header";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/income/import")({
  beforeLoad: ({ context }) => assertPermission(context, "donors.manage"),
  component: ImportContributionsPage,
  head: () => ({
    meta: [{ title: `Import contributions | ${env.VITE_APP_NAME}` }],
  }),
});

function ImportContributionsPage() {
  const navigate = useNavigate();
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="Upload a spreadsheet of donations, match its columns, check every row, then import. Nothing is saved as a contribution until the last step."
        title="Import contributions"
      />
      <div className="mt-6">
        <ImportWizard
          onCancel={() =>
            navigate({ search: { tab: "imports" }, to: "/income" })
          }
        />
      </div>
    </div>
  );
}
