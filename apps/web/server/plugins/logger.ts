import { initLogger } from "evlog";
import { definePlugin } from "nitro";

export default definePlugin(() => {
  initLogger({
    env: {
      service: "pi-dash",
      environment: process.env.NODE_ENV ?? "production",
    },
    pretty: process.env.NODE_ENV !== "production",
  });
});
