import type { PermissionId } from "@pi-dash/db/permissions";
import { createContext, use, useCallback, useMemo, useState } from "react";
import {
  buildNavGroups,
  buildNavItems,
  type NavGroup,
  type NavItem,
} from "@/lib/nav-items";

export type Section =
  | "profile"
  | "account"
  | "notifications"
  | "banking"
  | "expense-categories"
  | "whatsapp-groups";

interface AppUser {
  attendedOrientation?: boolean | null;
  email: string;
  gender?: string | null;
  id: string;
  image?: string | null;
  name: string;
  role?: string | null;
}

interface AppContextValue {
  hasPermission: (permission: PermissionId) => boolean;
  isAdmin: boolean;
  navGroups: NavGroup[];
  navItems: NavItem[];
  openSettings: (section?: Section) => void;
  permissions: string[];
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: Section) => void;
  settingsOpen: boolean;
  settingsSection: Section;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section>("profile");

  const isAdmin = user.role === "admin";
  const navItems = buildNavItems(permissions);
  const navGroups = buildNavGroups(permissions);

  // Keep useMemo: permissionSet is passed to consumers via hasPermission callback.
  // React Compiler cannot optimize across the context boundary.
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = useCallback(
    (permission: PermissionId) => permissionSet.has(permission),
    [permissionSet]
  );

  const openSettings = (section: Section = "banking") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  return (
    <AppContext
      value={{
        hasPermission,
        isAdmin,
        navGroups,
        navItems,
        openSettings,
        permissions,
        settingsOpen,
        settingsSection,
        setSettingsOpen,
        setSettingsSection,
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
