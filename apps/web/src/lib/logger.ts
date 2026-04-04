import { initLogger } from "evlog";

const isDev = process.env.NODE_ENV !== "production";

initLogger({
  env: {
    service: "pi-dash",
    environment: process.env.NODE_ENV ?? "production",
  },
  pretty: isDev,
});
