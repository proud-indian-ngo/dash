import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsLayout } from "@/components/settings/settings-layout";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  );
}
