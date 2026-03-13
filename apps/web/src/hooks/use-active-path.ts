import { useLocation } from "@tanstack/react-router";
import { useApp } from "@/context/app-context";

export const useActivePath = () => {
  const { pathname } = useLocation();
  const { navItems } = useApp();
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
