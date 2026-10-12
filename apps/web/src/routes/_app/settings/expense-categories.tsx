import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ExpenseCategoriesSection } from "@/components/settings/sections/expense-categories-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/expense-categories";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/expense-categories")({
  beforeLoad: ({ context }) =>
    assertPermission(context, "settings.expense_categories"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: ExpenseCategoriesSettingsPage,
});

function ExpenseCategoriesSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <ExpenseCategoriesSection />
    </SettingsPage>
  );
}
