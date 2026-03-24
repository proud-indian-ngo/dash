import { createContext, use, useState } from "react";
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
  isAdmin: boolean;
  isOriented: boolean;
  navGroups: NavGroup[];
  navItems: NavItem[];
  openSettings: (section?: Section) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: Section) => void;
  settingsOpen: boolean;
  settingsSection: Section;
  user: AppUser;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AppUser;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section>("profile");

  const isAdmin = user.role === "admin";
  const isOriented = isAdmin || Boolean(user.attendedOrientation);
  const navItems = buildNavItems(isAdmin, isOriented);
  const navGroups = buildNavGroups(isAdmin, isOriented);

  const openSettings = (section: Section = "banking") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  return (
    <AppContext
      value={{
        user,
        isAdmin,
        isOriented,
        navItems,
        navGroups,
        openSettings,
        settingsOpen,
        settingsSection,
        setSettingsOpen,
        setSettingsSection,
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
