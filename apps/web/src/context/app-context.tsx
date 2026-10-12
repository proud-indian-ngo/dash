import type { PermissionId } from "@pi-dash/db/permissions";
import { createContext, use, useCallback, useMemo } from "react";

import {
  buildNavGroups,
  buildNavItems,
  type NavGroup,
  type NavItem,
} from "@/lib/nav-items";

interface AppUser {
  email: string;
  gender?: string | null;
  id: string;
  image?: string | null;
  name: string;
  role?: string | null;
}

interface AppContextValue {
  hasPermission: (permission: PermissionId) => boolean;
  navGroups: NavGroup[];
  navItems: NavItem[];
  permissions: string[];
  user: AppUser;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  permissions = [],
  user,
}: {
  children: React.ReactNode;
  permissions?: string[];
  user: AppUser;
}) {
  const navItems = buildNavItems(permissions);
  const navGroups = buildNavGroups(permissions);

  // Keep useMemo: permissionSet is passed to consumers via hasPermission callback.
  // React Compiler cannot optimize across the context boundary.
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = useCallback(
    (permission: PermissionId) => permissionSet.has(permission),
    [permissionSet]
  );

  return (
    <AppContext
      value={{
        hasPermission,
        navGroups,
        navItems,
        permissions,
        user,
      }}
    >
      {children}
    </AppContext>
  );
}

export function useApp() {
  const context = use(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
