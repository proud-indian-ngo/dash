import { Kbd } from "@pi-dash/design-system/components/ui/kbd";
import { SidebarTrigger } from "@pi-dash/design-system/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import { useEffect, useState } from "react";

const APPLE_PLATFORM = /Mac|iPhone|iPad/;

/** "⌘" on Apple devices, "Ctrl+" elsewhere; decided after mount so SSR agrees. */
export function useShortcutModifier() {
  const [modifier, setModifier] = useState("Ctrl+");
  useEffect(() => {
    if (APPLE_PLATFORM.test(navigator.userAgent)) setModifier("⌘");
  }, []);
  return modifier;
}

/** The sidebar toggle, with a tooltip naming its ⌘B / Ctrl+B shortcut. */
export function SidebarToggle() {
  const modifier = useShortcutModifier();

  return (
    <Tooltip>
      <TooltipTrigger render={<SidebarTrigger className="-ml-1" />} />
      <TooltipContent className="flex items-center gap-2">
        Toggle sidebar
        <Kbd>{modifier}B</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
