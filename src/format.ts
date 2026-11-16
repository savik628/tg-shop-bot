/** Экранирует пользовательский текст для parse_mode "Markdown" (legacy). */
export function md(value: unknown): string {
  return String(value ?? "").replace(/([_*`\[])/g, "\\$1");
}

/** Экранирует спецсимволы для parse_mode "HTML". */
export function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
