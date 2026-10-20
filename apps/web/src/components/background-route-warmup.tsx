import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { useApp } from "@/context/app-context";
import { startRouteCodeWarmup } from "@/lib/route-code-warmup";

// Keep this bounded to the common destinations with measured first-visit cost.
const WARM_PATHS = [
  "/reimbursements",
  "/events",
  "/users",
  "/income",
  "/finance/books",
];

export function BackgroundRouteWarmup() {
  const router = useRouter();
  const { navItems } = useApp();

  useEffect(() => {
    const paths = WARM_PATHS.filter((path) =>
      navItems.some((item) => item.url === path)
    );
    return startRouteCodeWarmup(router, paths);
  }, [navItems, router]);

  return null;
}
