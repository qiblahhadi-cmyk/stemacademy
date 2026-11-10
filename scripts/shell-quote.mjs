/**
 * Quoting for arguments passed through cmd.exe (spawn with shell: true on Windows).
 * Node joins arguments with spaces without quoting them, so an argument such as
 * `npm test` would otherwise be split into two. Arguments containing whitespace,
 * quotes or cmd/batch metacharacters are wrapped in double quotes using the
 * standard Windows argv rules (backslashes before a quote are doubled).
 */
export function quoteWindowsArg(value) {
  const text = String(value);
  if (text.length > 0 && !/[\s"&|<>^,;=()%!]/.test(text)) return text;
  const escaped = text
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}
