import { initLogger } from "evlog";

const isDev = process.env.NODE_ENV !== "production";

initLogger({
  env: {
    service: "pi-dash",
    environment: process.env.NODE_ENV ?? "development",
  },
  pretty: isDev,
  sampling: isDev
    ? {
        rates: { info: 0 },
        keep: [{ status: 400 }, { duration: 500 }],
      }
    : undefined,
});
