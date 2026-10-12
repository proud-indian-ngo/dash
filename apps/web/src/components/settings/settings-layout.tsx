import { HugeiconsIcon } from "@hugeicons/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import {
  SETTINGS_GROUP_LABELS,
  type SettingsGroup,
  type SettingsPath,
  type SettingsSection,
  getSettingsSection,
  visibleSettingsSections,
} from "@/lib/settings-sections";

const GROUPS: SettingsGroup[] = ["you", "organization"];

function activeSection(sections: SettingsSection[], pathname: string) {
  return sections.find(
    (section) =>
      pathname === section.path || pathname.startsWith(`${section.path}/`)
  );
}

/**
 * The settings frame: a nav grouped into You and Organization on the left
 * (a select on phones), and the open section on the right.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { hasPermission } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sections = visibleSettingsSections(hasPermission);
  const active = activeSection(sections, pathname);
  const handleSelect = useEventCallback((path: string | null) => {
    if (path) {
      navigate({ to: path });
    }
  });

  return (
    <div className="app-container mx-auto grid max-w-6xl gap-6 px-2 py-6 sm:px-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
      <nav aria-label="Settings" className="hidden md:block">
        <p className="font-display mb-4 text-lg font-semibold">Settings</p>
        {GROUPS.map((group) => {
          const items = sections.filter((section) => section.group === group);
          if (items.length === 0) {
            return null;
          }
          return (
            <div className="mb-5" key={group}>
              <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">
                {SETTINGS_GROUP_LABELS[group]}
              </p>
              <ul className="flex flex-col gap-px">
                {items.map((section) => (
                  <li key={section.path}>
                    <Link
                      aria-current={
                        active?.path === section.path ? "page" : undefined
                      }
                      className={cn(
                        "hover:bg-muted flex h-7 items-center gap-2 rounded-md px-2 text-sm pointer-coarse:h-9",
                        active?.path === section.path &&
                          "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent font-medium"
                      )}
                      to={section.path}
                    >
                      <HugeiconsIcon
                        className="size-4 shrink-0 opacity-70"
                        icon={section.icon}
                        strokeWidth={2}
                      />
                      {section.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="min-w-0">
        <div className="mb-4 md:hidden">
          <Select onValueChange={handleSelect} value={active?.path ?? null}>
            <SelectTrigger aria-label="Settings section" className="w-full">
              <SelectValue>{active?.label ?? "Settings"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel>{SETTINGS_GROUP_LABELS[group]}</SelectLabel>
                  {sections
                    .filter((section) => section.group === group)
                    .map((section) => (
                      <SelectItem key={section.path} value={section.path}>
                        {section.label}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A settings section's page: the shared header, then its content. */
export function SettingsPage({
  actions,
  children,
  path,
}: {
  actions?: ReactNode;
  children: ReactNode;
  path: SettingsPath;
}) {
  const section = getSettingsSection(path);
  return (
    <>
      <PageHeader
        actions={actions}
        description={section.description}
        title={section.label}
      />
      <div className="mt-6 max-w-3xl">{children}</div>
    </>
  );
}
