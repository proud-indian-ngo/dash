import {
  BankIcon,
  NotificationIcon,
  ShieldIcon,
  SmartPhone01Icon,
  Tag01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pi-dash/design-system/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@pi-dash/design-system/components/ui/sidebar";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { type Section, useApp } from "@/context/app-context";
import { AccountSection } from "./sections/account-section";
import { BankingSection } from "./sections/banking-section";
import { ExpenseCategoriesSection } from "./sections/expense-categories-section";
import { NotificationsSection } from "./sections/notifications-section";
import { ProfileSection } from "./sections/profile-section";
import { WhatsAppGroupsSection } from "./sections/whatsapp-groups-section";

const NAV_ITEMS_BASE = [
  {
    id: "profile" as Section,
    label: "Profile",
    icon: UserIcon,
    adminOnly: false,
  },
  {
    id: "account" as Section,
    label: "Account",
    icon: ShieldIcon,
    adminOnly: false,
  },
  {
    id: "notifications" as Section,
    label: "Notifications",
    icon: NotificationIcon,
    adminOnly: false,
  },
  {
    id: "banking" as Section,
    label: "Banking",
    icon: BankIcon,
    adminOnly: false,
  },
  {
    id: "expense-categories" as Section,
    label: "Expense Categories",
    icon: Tag01Icon,
    adminOnly: true,
  },
  {
    id: "whatsapp-groups" as Section,
    label: "WhatsApp Groups",
    icon: SmartPhone01Icon,
    adminOnly: true,
  },
];

const SECTION_CONTENT: Record<Section, React.ReactNode> = {
  profile: <ProfileSection />,
  account: <AccountSection />,
  notifications: <NotificationsSection />,
  banking: <BankingSection />,
  "expense-categories": <ExpenseCategoriesSection />,
  "whatsapp-groups": <WhatsAppGroupsSection />,
};

export function SettingsDialog() {
  const {
    user,
    settingsOpen,
    settingsSection,
    setSettingsOpen,
    setSettingsSection,
  } = useApp();

  const isAdmin = user.role === "admin";

  const navItems = NAV_ITEMS_BASE.filter((item) => !item.adminOnly || isAdmin);

  const activeLabel =
    navItems.find((item) => item.id === settingsSection)?.label ?? "";

  return (
    <Dialog onOpenChange={setSettingsOpen} open={settingsOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-140 md:max-w-175 lg:max-w-200">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your profile and account settings.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar className="hidden md:flex" collapsible="none">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          aria-current={
                            settingsSection === item.id ? "page" : undefined
                          }
                          isActive={settingsSection === item.id}
                          onClick={() => setSettingsSection(item.id)}
                        >
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-135 flex-1 flex-col overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2">
              <div className="flex items-center gap-2 px-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <span className="text-muted-foreground text-xs">
                        Settings
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <AppErrorBoundary level="section">
                <div
                  className="fade-in-0 animate-in duration-75"
                  key={settingsSection}
                >
                  {SECTION_CONTENT[settingsSection]}
                </div>
              </AppErrorBoundary>
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
