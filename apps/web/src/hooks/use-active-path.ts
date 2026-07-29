import { useLocation } from "@tanstack/react-router";

export function resolveActivePath(
  pathname: string,
  paths: readonly string[]
): string {
  return (
    paths
      .filter(
        (path) =>
          pathname === path || (path !== "/" && pathname.startsWith(`${path}/`))
      )
      .sort((left, right) => right.length - left.length)[0] ?? ""
  );
}

export const useActivePath = (paths: readonly string[]) => {
  const { pathname } = useLocation();

  return resolveActivePath(pathname, paths);
};
