import { initLogger } from "evlog";

initLogger({
  env: {
    service: "pi-dash",
    environment: process.env.NODE_ENV ?? "development",
  },
  pretty: process.env.NODE_ENV !== "production",
});
