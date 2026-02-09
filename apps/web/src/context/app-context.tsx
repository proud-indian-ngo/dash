import { createContext, useCallback, useContext, useState } from "react";

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

  const openSettings = useCallback((section: Section = "banking") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
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
