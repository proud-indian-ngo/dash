import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@pi-dash/design-system/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import type { ReactElement, ReactNode } from "react";

/**
 * A picker's panel: a popover beside the trigger on wider screens, a bottom
 * drawer on phones, where a popover opened mid-form lands partly off-screen.
 * The drawer is titled with the field's label and closes with Done.
 */
export function ResponsivePicker({
  children,
  onOpenChange,
  open,
  title,
  trigger,
}: {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  trigger: ReactElement;
}) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverTrigger render={trigger} />
        <PopoverContent align="start" className="w-auto p-0">
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="data-[swipe-direction=down]:max-h-[90dvh]">
        <DrawerHeader className="pb-0 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Pick a value, then tap Done.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-col items-center overflow-y-auto overscroll-contain">
          {children}
        </div>
        <DrawerFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button onClick={() => onOpenChange(false)} type="button">
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
