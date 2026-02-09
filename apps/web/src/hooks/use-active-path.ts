import { useLocation } from "@tanstack/react-router";
import { useNavItems } from "@/hooks/use-nav-items";

export const useActivePath = () => {
  const { pathname } = useLocation();
  const navItems = useNavItems();
  let activePath = "";

  if (pathname === "/") {
    return "/";
  }

  for (const navItem of navItems) {
    if (pathname.startsWith(navItem.url) && navItem.url !== "/") {
      activePath = navItem.url;
      break;
    }
  }

  return activePath;
};
