import { courier } from "./client";

export async function generateCourierJwt(userId: string): Promise<string> {
  const { token } = await courier.auth.issueToken({
    scope: `user_id:${userId} inbox:read:messages inbox:write:events read:preferences write:preferences read:brands`,
    expires_in: "7 days",
  });

  if (!token) {
    throw new Error("Failed to issue Courier token");
  }

  return token;
}
