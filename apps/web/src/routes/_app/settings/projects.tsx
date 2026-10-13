import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ProjectsSection } from "@/components/settings/sections/projects-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/projects";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/projects")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.manage"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: ProjectsSettingsPage,
});

function ProjectsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <ProjectsSection />
    </SettingsPage>
  );
}
