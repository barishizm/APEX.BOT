import { test } from "node:test"
import assert from "node:assert/strict"
import { csvCell, toCsv } from "../lib/csv.ts"

test("quotes cells with commas, quotes and line breaks", () => {
  assert.equal(csvCell("plain"), "plain")
  assert.equal(csvCell('say "hi", then\nleave'), '"say ""hi"", then\nleave"')
  assert.equal(csvCell(null), "")
  assert.equal(csvCell(new Date("2026-10-17T12:00:00Z")), "2026-10-17T12:00:00.000Z")
})

test("defuses cells a spreadsheet would run as formulas", () => {
  for (const evil of ["=HYPERLINK(\"http://x\")", "+1", "-2+3", "@SUM(A1)", "\tx"]) assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), evil)
})

test("starts with a BOM and uses CRLF", () => {
  assert.equal(toCsv([["a", "b"], [1, true]]), "﻿a,b\r\n1,true")
})
