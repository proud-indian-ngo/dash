import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

export function DevTools() {
  return (
    <TanStackDevtools
      plugins={[
        {
          defaultOpen: false,
          name: "TanStack Router",
          render: <TanStackRouterDevtoolsPanel />,
        },
        formDevtoolsPlugin(),
      ]}
    />
  );
}
