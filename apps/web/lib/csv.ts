// CSV for spreadsheets. Cells that start with = + - @ (or a tab/CR) would run as formulas in
// Excel and Sheets, so they get a leading apostrophe (OWASP "CSV injection").

const FORMULA = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let s = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value)
  if (FORMULA.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows to CSV text, with a BOM so Excel reads it as UTF-8 and CRLF line endings. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
}
