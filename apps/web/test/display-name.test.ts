import { test } from "node:test"
import assert from "node:assert/strict"
import { firstName } from "../lib/display-name.ts"

test("greets by the first word of the display name", () => {
  assert.equal(firstName({ username: "jdoe", displayName: "Jane Ann Doe" }, "en"), "Jane")
})

test("softens an all-caps name, with the locale's casing rules", () => {
  assert.equal(firstName({ username: "MAHMUTBARISAKINTI", displayName: "MAHMUT BARIŞ AKINTI" }, "tr"), "Mahmut")
  assert.equal(firstName({ username: "x", displayName: "IŞIK" }, "tr"), "Işık")
})

test("leaves mixed-case names and short words alone", () => {
  assert.equal(firstName({ username: "x", displayName: "McKenzie" }, "en"), "McKenzie")
  assert.equal(firstName({ username: "x", displayName: "J. Doe" }, "en"), "J.")
})

test("falls back to the username without a display name", () => {
  assert.equal(firstName({ username: "jdoe", displayName: null }, "en"), "jdoe")
  assert.equal(firstName({ username: "jdoe", displayName: "  " }, "en"), "jdoe")
})
