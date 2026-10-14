import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";

import { BankImportWizard } from "@/components/income/bank/bank-import-wizard";
import { PageHeader } from "@/components/shared/page-header";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/income/bank/import")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.manage"),
  component: ImportBankStatementPage,
  head: () => ({
    meta: [{ title: `Import bank statement | ${env.VITE_APP_NAME}` }],
  }),
});

function ImportBankStatementPage() {
  const navigate = useNavigate();
  const [account] = useQueryState("account", parseAsString);
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="Upload a bank statement, match its columns and check its rows. Lines are imported and matched; no donation is created from them."
        title="Import bank statement"
      />
      <div className="mt-6">
        <BankImportWizard
          defaultAccountId={account ?? undefined}
          onCancel={() =>
            navigate({
              search: account ? { account } : {},
              to: "/income/bank",
            })
          }
        />
      </div>
    </div>
  );
}
