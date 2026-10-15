const LEADING_EMOJI_RE =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]️?\s*/u;

export function stripLeadingEmoji(text: string): string {
  return text.replace(LEADING_EMOJI_RE, "");
}
