import { Moon02Icon, SunIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useTheme } from "@pi-dash/design-system/lib/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const stableOnCheckedChange0 = useEventCallback(
    (v: boolean) => v && setTheme("light")
  );
  const stableOnCheckedChange1 = useEventCallback(
    (v: boolean) => v && setTheme("dark")
  );
  const stableOnCheckedChange2 = useEventCallback(
    (v: boolean) => v && setTheme("system")
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" />}>
        <HugeiconsIcon
          className="size-3.5 rotate-0 scale-100 transition-[transform,opacity] dark:-rotate-90 dark:scale-0"
          icon={Moon02Icon}
        />
        <HugeiconsIcon
          className="absolute size-3.5 rotate-90 scale-0 transition-[transform,opacity] dark:rotate-0 dark:scale-100"
          icon={SunIcon}
        />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={theme === "light"}
          onCheckedChange={stableOnCheckedChange0}
        >
          Light
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "dark"}
          onCheckedChange={stableOnCheckedChange1}
        >
          Dark
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "system"}
          onCheckedChange={stableOnCheckedChange2}
        >
          System
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
