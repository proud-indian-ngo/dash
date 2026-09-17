import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@pi-dash/design-system/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import styles from "./responsive-action-menu.module.css";

interface ActionMenuAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  render?: ReactElement;
  disabled?: boolean;
  destructive?: boolean;
  group?: string;
}

interface ResponsiveActionMenuProps {
  title: string;
  trigger: ReactElement;
  actions: readonly (ActionMenuAction | false | null | undefined)[];
  align?: "start" | "center" | "end";
  contentClassName?: string;
}

export function ResponsiveActionMenu(props: ResponsiveActionMenuProps) {
  const isMobile = useIsMobile();
  return (
    <ActionMenu
      key={isMobile ? "mobile" : "desktop"}
      {...props}
      isMobile={isMobile}
    />
  );
}

function ActionMenu({
  title,
  trigger,
  actions,
  align = "end",
  contentClassName,
  isMobile,
}: ResponsiveActionMenuProps & { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selecting = useRef(false);
  const visibleActions = actions.filter((action): action is ActionMenuAction =>
    Boolean(action)
  );

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) selecting.current = false;
    setOpen(nextOpen);
  }

  function select(action: ActionMenuAction) {
    if (action.disabled || selecting.current) return;
    selecting.current = true;
    // Release the focus trap before a callback opens another dialog. Keep the
    // callback in the click event so downloads retain browser user activation.
    flushSync(() => setOpen(false));
    triggerRef.current?.focus({ preventScroll: true });
    action.onSelect?.();
  }

  const finalFocus = () => !selecting.current;

  if (!visibleActions.length) return null;

  if (!isMobile) {
    return (
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger ref={triggerRef} render={trigger} />
        <DropdownMenuContent
          align={align}
          className={contentClassName}
          finalFocus={finalFocus}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuGroup>
            {visibleActions.map((action, index) => {
              const previous = visibleActions[index - 1];
              const separated =
                previous &&
                (previous.group !== action.group ||
                  Boolean(previous.destructive) !==
                    Boolean(action.destructive));
              return (
                <Fragment key={action.id}>
                  {separated ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    disabled={action.disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      select(action);
                    }}
                    render={action.render}
                    variant={action.destructive ? "destructive" : "default"}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                </Fragment>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const normalActions = visibleActions.filter((action) => !action.destructive);
  const destructiveActions = visibleActions.filter(
    (action) => action.destructive
  );

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <DrawerTrigger asChild className={styles.trigger} ref={triggerRef}>
        {trigger}
      </DrawerTrigger>
      <DrawerContent
        className={styles.sheet}
        finalFocus={finalFocus}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        showHandle={false}
      >
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain">
          <div className="bg-popover text-popover-foreground ring-foreground/10 overflow-hidden rounded-xl ring-1">
            <div className="flex flex-col items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="bg-muted-foreground/30 h-1 w-8 rounded-full"
              />
              <DrawerTitle className="text-center">{title}</DrawerTitle>
              <DrawerDescription className="sr-only">
                Choose an action or cancel to return.
              </DrawerDescription>
            </div>
            {normalActions.length ? (
              <MobileActions actions={normalActions} onSelect={select} />
            ) : null}
          </div>
          {destructiveActions.length ? (
            <div className="bg-popover text-popover-foreground ring-foreground/10 overflow-hidden rounded-xl ring-1">
              <MobileActions actions={destructiveActions} onSelect={select} />
            </div>
          ) : null}
        </div>
        <DrawerClose asChild>
          <Button
            className="bg-popover h-12 w-full shrink-0 rounded-xl"
            variant="outline"
          >
            Cancel
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

function MobileActions({
  actions,
  onSelect,
}: {
  actions: ActionMenuAction[];
  onSelect: (action: ActionMenuAction) => void;
}) {
  return (
    <ul className="divide-border divide-y">
      {actions.map((action) => (
        <li key={action.id}>
          <Button
            className={cn(
              "h-auto min-h-12 w-full justify-start gap-3 px-4 py-3 text-left text-sm whitespace-normal",
              action.destructive && "text-destructive"
            )}
            disabled={action.disabled}
            nativeButton={!action.render}
            role={action.render ? "link" : undefined}
            onKeyDown={(event) => {
              if (action.render && event.key === " ")
                event.preventBaseUIHandler();
            }}
            onKeyUp={(event) => {
              if (action.render && event.key === " ")
                event.preventBaseUIHandler();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(action);
            }}
            render={action.render}
            variant="ghost"
          >
            {action.icon}
            {action.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}
