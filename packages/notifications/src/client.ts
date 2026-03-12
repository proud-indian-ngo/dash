import { env } from "@pi-dash/env/server";
import CourierClient from "@trycourier/courier";

export const courier = env.COURIER_API_KEY
  ? new CourierClient({ apiKey: env.COURIER_API_KEY })
  : null;
