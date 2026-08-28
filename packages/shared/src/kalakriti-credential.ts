export async function createKalakritiCredentialTokenHash(): Promise<string> {
  const opaqueValue = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest("SHA-256", opaqueValue);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
