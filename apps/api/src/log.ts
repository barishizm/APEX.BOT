// JSON-line logger. String fields are PII-masked before they are written.
import { maskPII } from "./pii.ts";

type Level = "info" | "warn" | "error";

function clean(value: unknown): unknown {
  if (typeof value === "string") return maskPII(value);
  if (value instanceof Error) return maskPII(`${value.name}: ${value.message}`);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (process.env.APEX_SILENT === "1") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg: maskPII(msg), ...(clean(fields) as object) });
  (level === "info" ? console.log : console.error)(line);
}
