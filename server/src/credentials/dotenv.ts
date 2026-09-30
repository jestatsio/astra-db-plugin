/**
 * Minimal dotenv reader/writer: KEY=value, `export KEY=value`, single/double
 * quotes, full-line and trailing ` #` comments. Enough for the files `login`
 * and the Astra CLI write, without a dependency.
 */

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)?\s*$/;

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(raw)) continue;
    const match = raw.match(LINE);
    if (!match) continue;
    const [, key, rest = ""] = match;
    let value = rest.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      const quoted = value.slice(0, value.lastIndexOf(quote) + 1);
      value = quoted.slice(1, -1);
      if (quote === '"') {
        try {
          // mergeDotenv uses JSON quoting; decode escapes once (Windows paths included).
          value = JSON.parse(quoted) as string;
        } catch {
          // Also accept hand-written dotenv strings with non-JSON escape sequences.
          value = value.replace(/\\([\\nrt"])/g, (_match, escaped: string) =>
            ({ n: "\n", r: "\r", t: "\t" }[escaped] ?? escaped));
        }
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    out[key] = value;
  }
  return out;
}

function quoteIfNeeded(value: string): string {
  return /^[A-Za-z0-9_./:@+-]*$/.test(value) ? value : JSON.stringify(value);
}

/**
 * Merge `updates` into an existing dotenv text: replace keys in place (keeping
 * comments and unrelated lines), append new ones. `undefined` removes a key.
 */
export function mergeDotenv(existing: string, updates: Record<string, string | undefined>): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing.length ? existing.replace(/\r?\n$/, "").split(/\r?\n/) : [];
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(LINE);
    if (match && Object.hasOwn(updates, match[1])) {
      if (!pending.has(match[1])) continue; // remove duplicate assignments, including obsolete secrets
      const value = pending.get(match[1]);
      pending.delete(match[1]);
      if (value !== undefined) out.push(`${match[1]}=${quoteIfNeeded(value)}`);
      continue;
    }
    out.push(line);
  }
  const additions = [...pending].filter(([, v]) => v !== undefined);
  if (additions.length && out.length && out.at(-1) !== "") out.push("");
  for (const [key, value] of additions) out.push(`${key}=${quoteIfNeeded(value as string)}`);
  return `${out.join("\n")}\n`;
}
