/**
 * The fixed dev social API token is public (it is in the repository), so a
 * production seed must never create it.
 */
export function shouldSeedDevSocialToken(nodeEnv: string | undefined) {
  return nodeEnv !== "production";
}
