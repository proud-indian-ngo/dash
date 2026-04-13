"use client";

import {
  Dialog as DesktopDialog,
  DialogContent as DesktopDialogContent,
  DialogDescription as DesktopDialogDescription,
  DialogFooter as DesktopDialogFooter,
  DialogHeader as DesktopDialogHeader,
  DialogTitle as DesktopDialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@pi-dash/design-system/components/ui/drawer";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from "react";

const ResponsiveDialogContext = createContext<{
  isMobile: boolean;
} | null>(null);

function useResponsiveDialogContext(componentName: string) {
  const context = useContext(ResponsiveDialogContext);

  if (!context) {
    throw new Error(`${componentName} must be used within Dialog`);
  }

  return context;
}

export function Dialog({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const isMobile = useIsMobile();

  return (
    <ResponsiveDialogContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer onOpenChange={onOpenChange} open={open}>
          {children}
        </Drawer>
      ) : (
        <DesktopDialog
          onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
          open={open}
        >
          {children}
        </DesktopDialog>
      )}
    </ResponsiveDialogContext.Provider>
  );
}

interface DialogContentProps
  extends Omit<ComponentProps<typeof DesktopDialogContent>, "children"> {
  bodyClassName?: string;
  children: ReactNode;
}

export function DialogContent({
  bodyClassName,
  children,
  className,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  const { isMobile } = useResponsiveDialogContext("DialogContent");

  if (isMobile) {
    return (
      <DrawerContent className={cn("max-h-[90vh] overflow-hidden", className)}>
        <div
          className={cn(
            "grid min-h-0 flex-1 touch-pan-y gap-4 overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch]",
            bodyClassName
          )}
        >
          {children}
        </div>
      </DrawerContent>
    );
  }

  return (
    <DesktopDialogContent
      className={className}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DesktopDialogContent>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  const { isMobile } = useResponsiveDialogContext("DialogHeader");

  if (isMobile) {
    return (
      <DrawerHeader className={cn("p-0 text-left", className)} {...props} />
    );
  }

  return <DesktopDialogHeader className={className} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  const { isMobile } = useResponsiveDialogContext("DialogFooter");

  if (isMobile) {
    return <DrawerFooter className={cn("p-0 pt-2", className)} {...props} />;
  }

  return <DesktopDialogFooter className={className} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<"h2">) {
  const { isMobile } = useResponsiveDialogContext("DialogTitle");

  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }

  return <DesktopDialogTitle className={className} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  const { isMobile } = useResponsiveDialogContext("DialogDescription");

  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }

  return <DesktopDialogDescription className={className} {...props} />;
}
