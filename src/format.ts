/** Экранирует пользовательский текст для parse_mode "Markdown" (legacy). */
export function md(value: unknown): string {
  return String(value ?? "").replace(/([_*`\[])/g, "\\$1");
}
