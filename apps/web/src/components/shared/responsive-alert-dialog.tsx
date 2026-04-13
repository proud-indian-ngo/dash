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
import type { Button } from "@pi-dash/design-system/components/ui/button";
import type { ComponentProps, ReactNode } from "react";

export function AlertDialog({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  return (
    <DesktopAlertDialog
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
      open={open}
    >
      {children}
    </DesktopAlertDialog>
  );
}

interface AlertDialogContentProps
  extends Omit<ComponentProps<typeof DesktopAlertDialogContent>, "children"> {
  bodyClassName?: string;
  children: ReactNode;
}

export function AlertDialogContent({
  bodyClassName: _bodyClassName,
  children,
  className,
  ...props
}: AlertDialogContentProps) {
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
  return <DesktopAlertDialogHeader className={className} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return <DesktopAlertDialogFooter className={className} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<"h2">) {
  return <DesktopAlertDialogTitle className={className} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<"p">) {
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
