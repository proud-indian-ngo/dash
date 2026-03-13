import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { buildNavItems, type NavItem } from "@/lib/nav-items";

export type Section =
  | "profile"
  | "account"
  | "notifications"
  | "banking"
  | "expense-categories"
  | "whatsapp-groups";

interface AppUser {
  email: string;
  gender?: string | null;
  id: string;
  image?: string | null;
  name: string;
  role?: string | null;
}

interface AppContextValue {
  isAdmin: boolean;
  navItems: NavItem[];
  openSettings: (section?: Section) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: Section) => void;
  settingsOpen: boolean;
  settingsSection: Section;
  user: AppUser;
}

const AppContext = createContext<AppContextValue | null>(null);

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
  const navItems = useMemo(() => buildNavItems(isAdmin), [isAdmin]);

  const openSettings = useCallback((section: Section = "banking") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        isAdmin,
        navItems,
        openSettings,
        settingsOpen,
        settingsSection,
        setSettingsOpen,
        setSettingsSection,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
