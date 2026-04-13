"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@pi-dash/design-system/lib/utils";
import { type ComponentProps, isValidElement, type ReactNode } from "react";

type DrawerProps = Omit<DrawerPrimitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void;
};

function Drawer({
  onOpenChange,
  swipeDirection = "down",
  ...props
}: DrawerProps) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      onOpenChange={(open) => onOpenChange?.(open)}
      swipeDirection={swipeDirection}
      {...props}
    />
  );
}

interface DrawerTriggerProps
  extends Omit<DrawerPrimitive.Trigger.Props, "children" | "render"> {
  asChild?: boolean;
  children?: ReactNode;
}

function DrawerTrigger({
  asChild = false,
  children,
  ...props
}: DrawerTriggerProps) {
  if (asChild && isValidElement(children)) {
    return (
      <DrawerPrimitive.Trigger
        data-slot="drawer-trigger"
        render={children}
        {...props}
      />
    );
  }

  return (
    <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props}>
      {children}
    </DrawerPrimitive.Trigger>
  );
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

interface DrawerCloseProps
  extends Omit<DrawerPrimitive.Close.Props, "children" | "render"> {
  asChild?: boolean;
  children?: ReactNode;
}

function DrawerClose({
  asChild = false,
  children,
  ...props
}: DrawerCloseProps) {
  if (asChild && isValidElement(children)) {
    return (
      <DrawerPrimitive.Close
        data-slot="drawer-close"
        render={children}
        {...props}
      />
    );
  }

  return (
    <DrawerPrimitive.Close data-slot="drawer-close" {...props}>
      {children}
    </DrawerPrimitive.Close>
  );
}

function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      className={cn(
        "data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-black/10 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

function DrawerViewport({
  className,
  ...props
}: DrawerPrimitive.Viewport.Props) {
  return (
    <DrawerPrimitive.Viewport
      className={cn("fixed inset-0 z-50 overflow-hidden", className)}
      data-slot="drawer-viewport"
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  showHandle?: boolean;
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerViewport>
        <DrawerPrimitive.Popup
          className={cn(
            "group/drawer-content data-open:fade-in-0 data-closed:fade-out-0 fixed z-50 flex h-auto flex-col bg-popover text-popover-foreground text-xs/relaxed outline-none data-[swipe-direction=down]:inset-x-0 data-[swipe-direction=top]:inset-x-0 data-[swipe-direction=left]:inset-y-0 data-[swipe-direction=right]:inset-y-0 data-[swipe-direction=top]:top-0 data-[swipe-direction=right]:right-0 data-[swipe-direction=down]:bottom-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=down]:mt-24 data-[swipe-direction=top]:mb-24 data-[swipe-direction=down]:max-h-[80vh] data-[swipe-direction=top]:max-h-[80vh] data-[swipe-direction=left]:w-3/4 data-[swipe-direction=right]:w-3/4 data-closed:animate-out data-open:animate-in data-[swipe-direction=down]:rounded-none data-[swipe-direction=left]:rounded-none data-[swipe-direction=right]:rounded-none data-[swipe-direction=top]:rounded-none data-[swipe-direction=down]:border-t data-[swipe-direction=left]:border-r data-[swipe-direction=top]:border-b data-[swipe-direction=right]:border-l data-[swipe-direction=left]:sm:max-w-sm data-[swipe-direction=right]:sm:max-w-sm",
            className
          )}
          data-slot="drawer-content"
          {...props}
        >
          <DrawerPrimitive.Content className="contents" data-slot="drawer-body">
            {showHandle ? (
              <div className="mx-auto mt-4 h-1 w-[100px] shrink-0 rounded-none bg-muted group-data-[swipe-direction=down]/drawer-content:block group-data-[swipe-direction=left]/drawer-content:hidden group-data-[swipe-direction=right]/drawer-content:hidden group-data-[swipe-direction=top]/drawer-content:hidden" />
            ) : null}
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerViewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[swipe-direction=down]/drawer-content:text-center group-data-[swipe-direction=top]/drawer-content:text-center md:gap-0.5 md:text-left",
        className
      )}
      data-slot="drawer-header"
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      data-slot="drawer-footer"
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      className={cn("font-medium text-foreground text-sm", className)}
      data-slot="drawer-title"
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-muted-foreground text-xs/relaxed", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
};
