import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { RazorpaySection } from "@/components/settings/sections/razorpay-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/integrations";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/integrations")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.view"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <RazorpaySection />
    </SettingsPage>
  );
}
