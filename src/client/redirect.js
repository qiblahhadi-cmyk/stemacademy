/**
 * Accept only same-origin absolute paths, so ?next= cannot send a visitor to
 * another site (open redirect). Anything else falls back to the dashboard.
 */
export function safeNextPath(value, fallback = "/index.html") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
