import { useApp } from "@/context/app-context";

/**
 * Finance changes the charge: finance.manage, or whoever approves requests
 * and sees everyone's. Mirrors `assertCanChangeCharge`.
 */
export function useCanChangeCharge(): boolean {
  const { hasPermission } = useApp();
  return (
    hasPermission("finance.manage") ||
    (hasPermission("requests.approve") && hasPermission("requests.view_all"))
  );
}
