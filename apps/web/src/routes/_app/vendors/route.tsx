import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertOriented } from "@/lib/route-guards";

// @ts-expect-error Route tree will be regenerated on dev server start
export const Route = createFileRoute("/_app/vendors")({
  // biome-ignore lint/suspicious/noExplicitAny: context type from route tree
  beforeLoad: ({ context }: any) => assertOriented(context),
  component: () => <Outlet />,
});
