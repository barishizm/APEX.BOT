import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { proxy } from "../proxy.ts"

const location = (path: string) => {
  const response = proxy(new NextRequest(`https://app.example.test${path}`))
  return { status: response.status, to: response.headers.get("location") }
}

test("the canonical-locale redirect never leaves the site", () => {
  for (const path of ["/en//evil.example", "/en///evil.example", "/en/\\evil.example"]) {
    const { status, to } = location(path)
    assert.equal(status, 308, path)
    assert.ok(to && new URL(to).origin === "https://app.example.test", `${path} -> ${to}`)
  }
})

test("a normal /en/ path still redirects to its canonical URL", () => {
  assert.deepEqual(location("/en/pricing?x=1"), { status: 308, to: "https://app.example.test/pricing?x=1" })
})
