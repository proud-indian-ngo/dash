import { useSidebar } from "@pi-dash/design-system/components/ui/sidebar";
import lockupReversed from "@proudindian/design/logo/svg/pi-lockup-compact-reversed.svg";
import lockup from "@proudindian/design/logo/svg/pi-lockup-compact.svg";
import symbolReversed from "@proudindian/design/logo/svg/pi-symbol-reversed.svg";
import symbol from "@proudindian/design/logo/svg/pi-symbol.svg";
import { Link } from "@tanstack/react-router";

/**
 * The Proud Indian logo at the top of the sidebar, linking home. Uses the
 * official files as-is: the compact lockup (24px tall) when open, the symbol
 * alone when collapsed, and the reversed files in dark mode.
 */
export function SidebarBrand() {
  const { isMobile, state } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const [light, dark] = collapsed
    ? [symbol, symbolReversed]
    : [lockup, lockupReversed];

  return (
    <Link
      aria-label="Proud Indian dashboard home"
      className="ring-sidebar-ring flex h-10 items-center rounded-md px-2 outline-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
      to="/"
    >
      <img alt="" className="h-6 w-auto dark:hidden" src={light} />
      <img alt="" className="hidden h-6 w-auto dark:block" src={dark} />
    </Link>
  );
}
