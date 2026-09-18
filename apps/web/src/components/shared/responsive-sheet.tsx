"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet as DesktopSheet,
  SheetContent as DesktopSheetContent,
  SheetDescription as DesktopSheetDescription,
  SheetHeader as DesktopSheetHeader,
  SheetTitle as DesktopSheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from "react";

import styles from "./responsive-sheet.module.css";

const ResponsiveSheetContext = createContext<{
  isMobile: boolean;
} | null>(null);

function useResponsiveSheetContext(componentName: string) {
  const context = useContext(ResponsiveSheetContext);

  if (!context) {
    throw new Error(`${componentName} must be used within Sheet`);
  }

  return context;
}

export function Sheet({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const isMobile = useIsMobile();
  const handleOpenChange = useEventCallback((nextOpen: boolean) =>
    onOpenChange?.(nextOpen)
  );

  return (
    <ResponsiveSheetContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <DrawerPrimitive.Root onOpenChange={handleOpenChange} open={open}>
          {children}
        </DrawerPrimitive.Root>
      ) : (
        <DesktopSheet onOpenChange={handleOpenChange} open={open}>
          {children}
        </DesktopSheet>
      )}
    </ResponsiveSheetContext.Provider>
  );
}

interface SheetContentProps extends Omit<
  ComponentProps<typeof DesktopSheetContent>,
  "children"
> {
  children?: ReactNode;
}

export function SheetContent({
  children,
  className,
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const { isMobile } = useResponsiveSheetContext("SheetContent");

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop className={styles.backdrop} />
        <DrawerPrimitive.Viewport className={styles.viewport}>
          <ScrollArea.Root
            className={styles.scrollRoot}
            style={{ position: "static" }}
          >
            <ScrollArea.Viewport className={styles.scrollViewport}>
              <ScrollArea.Content className={styles.scrollContent}>
                <DrawerPrimitive.Popup className={styles.popup}>
                  <div className={styles.panel}>
                    <div className={styles.header}>
                      <div aria-hidden className={styles.headerSpacer} />
                      <div className={styles.handle} />
                      {showCloseButton ? (
                        <DrawerPrimitive.Close
                          aria-label="Close"
                          className={styles.close}
                          render={
                            <Button
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            />
                          }
                        >
                          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                          <span className="sr-only">Close</span>
                        </DrawerPrimitive.Close>
                      ) : (
                        <div aria-hidden className={styles.headerSpacer} />
                      )}
                    </div>
                    <DrawerPrimitive.Content
                      aria-describedby={props["aria-describedby"]}
                      aria-label={props["aria-label"]}
                      aria-labelledby={props["aria-labelledby"]}
                      className={styles.content}
                    >
                      {children}
                    </DrawerPrimitive.Content>
                  </div>
                </DrawerPrimitive.Popup>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className={styles.scrollbar}>
              <ScrollArea.Thumb className={styles.thumb} />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DesktopSheetContent
      className={className}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DesktopSheetContent>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  const { isMobile } = useResponsiveSheetContext("SheetHeader");

  if (isMobile) {
    return (
      <div
        className={cn("flex flex-col gap-0.5 p-4", className)}
        data-slot="sheet-header"
        {...props}
      />
    );
  }

  return <DesktopSheetHeader className={className} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<"h2">) {
  const { isMobile } = useResponsiveSheetContext("SheetTitle");

  if (isMobile) {
    return (
      <DrawerPrimitive.Title
        className={cn("text-foreground text-sm font-medium", className)}
        data-slot="sheet-title"
        {...props}
      />
    );
  }

  return <DesktopSheetTitle className={className} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<"p">) {
  const { isMobile } = useResponsiveSheetContext("SheetDescription");

  if (isMobile) {
    return (
      <DrawerPrimitive.Description
        className={cn("text-muted-foreground text-xs/relaxed", className)}
        data-slot="sheet-description"
        {...props}
      />
    );
  }

  return <DesktopSheetDescription className={className} {...props} />;
}
