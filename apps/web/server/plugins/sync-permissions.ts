import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { definePlugin } from "nitro";

export default definePlugin(async () => {
  await syncPermissions();
});
