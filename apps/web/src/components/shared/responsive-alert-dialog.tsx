"use client";

import {
  AlertDialog as DesktopAlertDialog,
  AlertDialogAction as DesktopAlertDialogAction,
  AlertDialogCancel as DesktopAlertDialogCancel,
  AlertDialogContent as DesktopAlertDialogContent,
  AlertDialogDescription as DesktopAlertDialogDescription,
  AlertDialogFooter as DesktopAlertDialogFooter,
  AlertDialogHeader as DesktopAlertDialogHeader,
  AlertDialogTitle as DesktopAlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@pi-dash/design-system/components/ui/drawer";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from "react";

const ResponsiveAlertDialogContext = createContext<{
  isMobile: boolean;
} | null>(null);

function useIsMobileAlertDialog(componentName: string) {
  const context = useContext(ResponsiveAlertDialogContext);

  if (!context) {
    throw new Error(`${componentName} must be used within AlertDialog`);
  }

  return context.isMobile;
}

/**
 * Confirmations: a centred alert dialog on wider screens, a bottom drawer on
 * phones like every other dialog. Like the desktop alert, a tap outside
 * doesn't close it, so a stray tap can't lose a typed reason; swiping it
 * down is the same as Cancel.
 */
export function AlertDialog({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const isMobile = useIsMobile();
  const stableOnOpenChange0 = useEventCallback((nextOpen: boolean) =>
    onOpenChange?.(nextOpen)
  );

  return (
    <ResponsiveAlertDialogContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer
          disablePointerDismissal
          onOpenChange={stableOnOpenChange0}
          open={open}
        >
          {children}
        </Drawer>
      ) : (
        <DesktopAlertDialog onOpenChange={stableOnOpenChange0} open={open}>
          {children}
        </DesktopAlertDialog>
      )}
    </ResponsiveAlertDialogContext.Provider>
  );
}

interface AlertDialogContentProps extends Omit<
  ComponentProps<typeof DesktopAlertDialogContent>,
  "children"
> {
  children: ReactNode;
}

export function AlertDialogContent({
  children,
  className,
  ...props
}: AlertDialogContentProps) {
  const isMobile = useIsMobileAlertDialog("AlertDialogContent");

  if (isMobile) {
    return (
      <DrawerContent
        className={cn(
          "overflow-hidden data-[swipe-direction=down]:max-h-[90dvh]",
          className
        )}
        role="alertdialog"
      >
        <div
          className="grid min-h-0 flex-1 touch-pan-y gap-4 overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch]"
          data-slot="drawer-scroll"
        >
          {children}
        </div>
      </DrawerContent>
    );
  }

  return (
    <DesktopAlertDialogContent className={className} {...props}>
      {children}
    </DesktopAlertDialogContent>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  const isMobile = useIsMobileAlertDialog("AlertDialogHeader");

  if (isMobile) {
    return (
      <DrawerHeader className={cn("p-0 text-left", className)} {...props} />
    );
  }

  return <DesktopAlertDialogHeader className={className} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  const isMobile = useIsMobileAlertDialog("AlertDialogFooter");

  if (isMobile) {
    return <DrawerFooter className={cn("p-0 pt-2", className)} {...props} />;
  }

  return <DesktopAlertDialogFooter className={className} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<"h2">) {
  const isMobile = useIsMobileAlertDialog("AlertDialogTitle");

  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }

  return <DesktopAlertDialogTitle className={className} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  const isMobile = useIsMobileAlertDialog("AlertDialogDescription");

  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }

  return <DesktopAlertDialogDescription className={className} {...props} />;
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <DesktopAlertDialogAction className={className} {...props} />;
}

interface AlertDialogCancelProps extends ComponentProps<typeof Button> {
  children: ReactNode;
}

export function AlertDialogCancel({
  children,
  className,
  size = "default",
  variant = "outline",
  ...props
}: AlertDialogCancelProps) {
  const isMobile = useIsMobileAlertDialog("AlertDialogCancel");

  if (isMobile) {
    return (
      <DrawerClose asChild>
        <Button className={className} size={size} variant={variant} {...props}>
          {children}
        </Button>
      </DrawerClose>
    );
  }

  return (
    <DesktopAlertDialogCancel
      className={className}
      size={size}
      variant={variant}
      {...props}
    >
      {children}
    </DesktopAlertDialogCancel>
  );
}
