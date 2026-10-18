import { test } from "node:test"
import assert from "node:assert/strict"
import { IMPERSONATION_EXIT_PATH, impersonationBlocks } from "../lib/impersonation.ts"

test("refuses every write while viewing as a user", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    for (const path of ["/api/bot", "/api/conversations/123", "/api/account/password", "/api/admin/users/1/suspend", "/dashboard/settings", "/api/auth/logout"]) {
      assert.equal(impersonationBlocks(method, path, true), true, `${method} ${path}`)
    }
  }
})

test("lets reads through, and the exit", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(impersonationBlocks(method, "/api/conversations", true), false, method)
  assert.equal(impersonationBlocks("POST", IMPERSONATION_EXIT_PATH, true), false)
  assert.equal(impersonationBlocks("POST", `${IMPERSONATION_EXIT_PATH}/`, true), false)
  assert.equal(impersonationBlocks("POST", `${IMPERSONATION_EXIT_PATH}x`, true), true, "only the exit itself")
})

test("changes nothing without the impersonation cookie", () => {
  assert.equal(impersonationBlocks("POST", "/api/bot", false), false)
  assert.equal(impersonationBlocks("DELETE", "/api/conversations/1", false), false)
})
