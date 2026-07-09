import {
  BankIcon,
  CommandIcon,
  NotificationIcon,
  Settings01Icon,
  ShieldIcon,
  SmartPhone01Icon,
  Tag01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PermissionId } from "@pi-dash/db/permissions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pi-dash/design-system/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { lazy, Suspense } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { type Section, useApp } from "@/context/app-context";

interface NavItem {
  icon: typeof Settings01Icon;
  id: Section;
  label: string;
  permission?: PermissionId;
}

const NAV_ITEMS_BASE: NavItem[] = [
  {
    icon: Settings01Icon,
    id: "general",
    label: "General",
    permission: "settings.app_config",
  },
  {
    icon: UserIcon,
    id: "profile",
    label: "Profile",
  },
  {
    icon: ShieldIcon,
    id: "account",
    label: "Account",
  },
  {
    icon: NotificationIcon,
    id: "notifications",
    label: "Notifications",
  },
  {
    icon: BankIcon,
    id: "banking",
    label: "Banking",
  },
  {
    icon: Tag01Icon,
    id: "expense-categories",
    label: "Expense Categories",
    permission: "settings.expense_categories",
  },
  {
    icon: SmartPhone01Icon,
    id: "whatsapp-groups",
    label: "WhatsApp Groups",
    permission: "settings.whatsapp_groups",
  },
  {
    icon: CommandIcon,
    id: "admin-actions",
    label: "Admin Actions",
    permission: "jobs.manage",
  },
];

const SECTION_COMPONENTS = {
  account: lazy(() =>
    import("./sections/account-section").then((module) => ({
      default: module.AccountSection,
    }))
  ),
  "admin-actions": lazy(() =>
    import("./sections/admin-actions-section").then((module) => ({
      default: module.AdminActionsSection,
    }))
  ),
  banking: lazy(() =>
    import("./sections/banking-section").then((module) => ({
      default: module.BankingSection,
    }))
  ),
  "expense-categories": lazy(() =>
    import("./sections/expense-categories-section").then((module) => ({
      default: module.ExpenseCategoriesSection,
    }))
  ),
  general: lazy(() =>
    import("./sections/general-section").then((module) => ({
      default: module.GeneralSection,
    }))
  ),
  notifications: lazy(() =>
    import("./sections/notifications-section").then((module) => ({
      default: module.NotificationsSection,
    }))
  ),
  profile: lazy(() =>
    import("./sections/profile-section").then((module) => ({
      default: module.ProfileSection,
    }))
  ),
  "whatsapp-groups": lazy(() =>
    import("./sections/whatsapp-groups-section").then((module) => ({
      default: module.WhatsAppGroupsSection,
    }))
  ),
};

function SettingsNavButton({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: NavItem;
  onSelect: (section: Section) => void;
}) {
  const handleClick = useEventCallback(() => onSelect(item.id));

  return (
    <SidebarMenuButton
      aria-current={active ? "page" : undefined}
      isActive={active}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
      <span>{item.label}</span>
    </SidebarMenuButton>
  );
}

export function SettingsDialog() {
  const {
    hasPermission,
    settingsOpen,
    settingsSection,
    setSettingsOpen,
    setSettingsSection,
  } = useApp();

  const navItems = NAV_ITEMS_BASE.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const activeLabel =
    navItems.find((item) => item.id === settingsSection)?.label ?? "";
  const ActiveSection = SECTION_COMPONENTS[settingsSection];
  const stableOnValueChange0 = useEventCallback((v: string | null) =>
    setSettingsSection(v as Section)
  );

  return (
    <Dialog onOpenChange={setSettingsOpen} open={settingsOpen}>
      <DialogContent
        bodyClassName="gap-0 p-0"
        className="max-h-[85vh] overflow-hidden p-0 md:max-w-[700px] lg:max-w-[800px]"
      >
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
                        <SettingsNavButton
                          active={settingsSection === item.id}
                          item={item}
                          onSelect={setSettingsSection}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex max-h-[85vh] flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-col gap-2 px-4 pt-4">
              <div className="md:hidden">
                <Select
                  onValueChange={stableOnValueChange0}
                  value={settingsSection}
                >
                  <SelectTrigger aria-label="Settings section">
                    <SelectValue>{activeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {navItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <span className="text-muted-foreground text-xs">
                        Settings
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <AppErrorBoundary level="section">
                {settingsOpen ? (
                  <Suspense fallback={null}>
                    <div
                      className="fade-in-0 animate-in duration-100 ease-(--ease-out-expo)"
                      key={settingsSection}
                    >
                      <ActiveSection />
                    </div>
                  </Suspense>
                ) : null}
              </AppErrorBoundary>
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
