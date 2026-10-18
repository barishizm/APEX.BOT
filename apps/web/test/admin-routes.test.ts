import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { IMPERSONATION_EXIT_PATH } from "../lib/impersonation.ts"

// Every /api/admin route and every /admin page checks the staff session itself (proxy.ts only looks
// for a cookie). These checks read the source, so a new route that forgets the guard fails here
// rather than in production. A handler passes when it is built by withAdminAction or adminListRoute,
// or when awaiting requireAdminSession is the first thing it does; anything the checks can't read
// fails too. A route that really needs no staff session goes in EXCEPTIONS, with the reason.

const WEB = join(import.meta.dirname, "..")
const API_ADMIN = join(WEB, "app/api/admin")
const ADMIN_PAGES = join(WEB, "app/(app)/admin")

const EXCEPTIONS: Record<string, Partial<Record<Method, string>>> = {
  // whoever holds the impersonation cookie may end the view, and it is the one write the proxy lets
  // through while one is open (lib/impersonation.ts)
  "impersonation/exit/route.ts": { POST: "ends a read-only view; needs only the impersonation cookie" },
}

const METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const
type Method = (typeof METHODS)[number]
const WRITES = new Set<Method>(["POST", "PUT", "PATCH", "DELETE"])
// route segment config Next reads from a route file; not handlers
const CONFIG = new Set(["maxDuration", "dynamic", "dynamicParams", "revalidate", "runtime", "preferredRegion", "fetchCache"])

const blank = (s: string) => s.replace(/[^\n]/g, " ")

/** The source with comments and the insides of string and template literals blanked, offsets kept. */
function codeOnly(src: string, file: string): string {
  let out = ""
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i)
      const stop = end < 0 ? src.length : end
      out += blank(src.slice(i, stop))
      i = stop
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2)
      assert.ok(end >= 0, `${file}: unterminated comment`)
      out += blank(src.slice(i, end + 2))
      i = end + 2
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++
        else assert.ok(c === "`" || src[j] !== "\n", `${file}: can't read a string literal at offset ${i}`)
        j++
      }
      assert.ok(j < src.length, `${file}: unterminated string at offset ${i}`)
      out += c + blank(src.slice(i + 1, j)) + c
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" }

/** The index of the bracket that closes the one at `open`. */
function closing(code: string, open: number, file: string): number {
  const stack: string[] = []
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (PAIRS[c]) stack.push(PAIRS[c])
    else if (c === ")" || c === "]" || c === "}") {
      assert.equal(c, stack.pop(), `${file}: unbalanced brackets at offset ${i}`)
      if (!stack.length) return i
    }
  }
  assert.fail(`${file}: no closing bracket for offset ${open}`)
}

/** The body (between its braces) of the function whose name or arrow starts at `from`. */
function bodyAfter(code: string, from: number, file: string): string {
  const paren = code.indexOf("(", from)
  const open = code.indexOf("{", closing(code, paren, file))
  return code.slice(open + 1, closing(code, open, file))
}

// `[const x =] await guard(` as the handler's first statement, optionally inside a leading `try {`
const guardFirst = (body: string, guard: string) =>
  new RegExp(`^\\s*(try\\s*\\{\\s*)?((const|let)\\s+[^=;]+=\\s*)?await\\s+${guard}\\s*[(<]`).test(body)

function sourceFiles(dir: string, name: RegExp): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => name.test(f.split("/").pop()!))
    .map((f) => join(dir, f))
    .sort()
}

/** Names imported from `from` in a file's raw source. */
function importsFrom(src: string, from: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    if (m[2] !== from) continue
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "")
      if (name) names.add(name)
    }
  }
  return names
}

interface Handler {
  method: Method
  kind: "const" | "function"
  /** what follows `=` for a const, the function body otherwise */
  text: string
}

function handlersOf(code: string, file: string): Handler[] {
  assert.doesNotMatch(code, /\bexport\s+(default\b|\*|\{)/, `${file}: export handlers as \`export const\` or \`export async function\` so they can be checked`)
  const found: Handler[] = []
  for (const m of code.matchAll(/\bexport\s+(?:(?:async\s+)?(function)\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/g)) {
    const name = m[2]
    if (CONFIG.has(name)) continue
    assert.ok((METHODS as readonly string[]).includes(name), `${file}: \`${name}\` isn't an HTTP method or route config; don't export it from a route file`)
    const end = m.index + m[0].length
    if (m[1] === "function") {
      found.push({ method: name as Method, kind: "function", text: bodyAfter(code, end, file) })
    } else {
      const eq = code.indexOf("=", end)
      found.push({ method: name as Method, kind: "const", text: code.slice(eq + 1) })
    }
  }
  return found
}

/** Every handler in the file's ACTIONS map, in the object literal and in later `ACTIONS[…] =` lines. */
function actionValues(code: string, file: string): string[] {
  const decl = /\bconst\s+ACTIONS\b[^=]*=\s*\{/.exec(code)
  assert.ok(decl, `${file}: dispatches on ACTIONS but declares no \`const ACTIONS = { … }\``)
  const open = decl.index + decl[0].length - 1
  const literal = code.slice(open + 1, closing(code, open, file))

  const values: string[] = []
  let depth = 0
  let start = 0
  const take = (prop: string) => {
    if (!prop.trim()) return
    let d = 0
    let colon = -1
    for (let i = 0; i < prop.length && colon < 0; i++) {
      if (PAIRS[prop[i]]) d++
      else if (")]}".includes(prop[i])) d--
      else if (prop[i] === ":" && d === 0) colon = i
    }
    assert.ok(colon > 0, `${file}: every ACTIONS entry must be \`name: withAdminAction(…)\`, found \`${prop.trim().slice(0, 40)}\``)
    values.push(prop.slice(colon + 1))
  }
  for (let i = 0; i < literal.length; i++) {
    if (PAIRS[literal[i]]) depth++
    else if (")]}".includes(literal[i])) depth--
    else if (literal[i] === "," && depth === 0) {
      take(literal.slice(start, i))
      start = i + 1
    }
  }
  take(literal.slice(start))

  for (const m of code.matchAll(/\bACTIONS\s*\[[^\]]*\]\s*=(?!=)/g)) values.push(code.slice(m.index + m[0].length))
  assert.doesNotMatch(code, /Object\.assign\(\s*ACTIONS\b/, `${file}: add actions as \`name: withAdminAction(…)\``)
  return values
}

const startsWith = (text: string, fn: string) => new RegExp(`^\\s*${fn}\\s*[(<]`).test(text)

const routes = sourceFiles(API_ADMIN, /^route\.ts$/)

test("finds the admin API routes", () => {
  assert.ok(routes.length >= 20, `only ${routes.length} route files under app/api/admin`)
})

/** Throws, naming the file and method, when a handler in this route file could run without the staff session. */
function checkRoute(file: string, src: string) {
  const code = codeOnly(src, file)
  const handlers = handlersOf(code, file)
  assert.ok(handlers.length, `${file}: exports no handler`)

  // the guards must be the real ones, not a local stand-in
  assert.doesNotMatch(code, /\b(function|const|let|var)\s+(requireAdminSession|withAdminAction|adminListRoute)\b/, `${file}: defines its own guard`)
  const fromAuth = importsFrom(src, "@/lib/auth")
  const fromAdmin = importsFrom(src, "@/lib/admin")
  const fromList = importsFrom(src, "@/lib/admin-list")

  for (const h of handlers) {
    const where = `${file} ${h.method}`
    if (EXCEPTIONS[file]?.[h.method]) continue

    if (h.kind === "const") {
      if (startsWith(h.text, "withAdminAction")) {
        assert.ok(fromAdmin.has("withAdminAction"), `${where}: import withAdminAction from @/lib/admin`)
        assert.ok(WRITES.has(h.method), `${where}: withAdminAction is for writes; reads use adminListRoute or requireAdminSession`)
      } else if (startsWith(h.text, "adminListRoute")) {
        assert.ok(fromList.has("adminListRoute"), `${where}: import adminListRoute from @/lib/admin-list`)
        assert.equal(h.method, "GET", `${where}: adminListRoute answers GET only`)
      } else {
        assert.fail(`${where}: build it with withAdminAction or adminListRoute, or make it a function that awaits requireAdminSession first`)
      }
      continue
    }

    if (guardFirst(h.text, "requireAdminSession")) {
      assert.ok(fromAuth.has("requireAdminSession"), `${where}: import requireAdminSession from @/lib/auth`)
      // a cross-site form can't send JSON without a preflight (lib/auth.ts readJson)
      if (WRITES.has(h.method)) assert.match(h.text, /\breadJson\s*\(\s*request\s*\)/, `${where}: a write must read its body with readJson(request)`)
      continue
    }

    // POST /…/<id>/<action>: looks the action up in ACTIONS, every one of which is a withAdminAction
    if (/=\s*ACTIONS\s*\[/.test(h.text)) {
      assert.ok(WRITES.has(h.method), `${where}: only writes dispatch on ACTIONS`)
      const awaits = [...h.text.matchAll(/\bawait\s+([\w$.]+)/g)].map((m) => m[1])
      assert.deepEqual(awaits, ["route.params"], `${where}: a dispatcher may only await its params before handing over`)
      assert.match(h.text, /\breturn\s+handler\s*\(\s*request\s*,\s*route\s*\)/, `${where}: hand the request to the chosen action`)
      assert.ok(fromAdmin.has("withAdminAction"), `${where}: import withAdminAction from @/lib/admin`)
      const actions = actionValues(code, file)
      assert.ok(actions.length, `${where}: ACTIONS is empty`)
      for (const value of actions) {
        assert.ok(startsWith(value, "withAdminAction"), `${where}: every action must be a withAdminAction(…), found \`${value.trim().slice(0, 40)}\``)
      }
      continue
    }

    assert.fail(`${where}: await requireAdminSession before anything else, or use withAdminAction / adminListRoute`)
  }
}

test("every /api/admin handler checks the staff session first", () => {
  for (const path of routes) checkRoute(relative(API_ADMIN, path), readFileSync(path, "utf8"))
})

test("exceptions name routes and methods that exist, and only the impersonation exit", () => {
  for (const [file, methods] of Object.entries(EXCEPTIONS)) {
    const path = join(API_ADMIN, file)
    assert.ok(existsSync(path), `EXCEPTIONS lists ${file}, which no longer exists`)
    const exported = handlersOf(codeOnly(readFileSync(path, "utf8"), file), file).map((h) => h.method)
    for (const [method, why] of Object.entries(methods)) {
      assert.ok(why.trim(), `${file} ${method}: say why it needs no staff session`)
      assert.ok(exported.includes(method as Method), `EXCEPTIONS lists ${file} ${method}, which isn't exported`)
    }
  }
  // the proxy lets exactly this path through while viewing as a user
  assert.equal(`/api/admin/${Object.keys(EXCEPTIONS)[0].replace(/\/route\.ts$/, "")}`, IMPERSONATION_EXIT_PATH)
  assert.equal(Object.keys(EXCEPTIONS).length, 1)
})

test("withAdminAction checks the session, step-up and JSON body before running a handler", () => {
  const file = "lib/admin.ts"
  const code = codeOnly(readFileSync(join(WEB, file), "utf8"), file)
  const at = /\bexport\s+function\s+withAdminAction\b/.exec(code)
  assert.ok(at, `${file}: withAdminAction not found`)
  const outer = bodyAfter(code, at.index + at[0].length, file)
  const arrow = /return\s+async\s*\(/.exec(outer)
  assert.ok(arrow, `${file}: withAdminAction must return an async handler`)
  const inner = bodyAfter(outer, arrow.index, file)
  assert.ok(guardFirst(inner, "requireAdminSession"), `${file}: the handler must await requireAdminSession first`)
  const order = ["requireAdminSession", "requireStepUp", "readJson", "transaction", "writeAudit"].map((fn) => {
    const i = inner.search(new RegExp(`\\b${fn}\\s*\\(`))
    assert.ok(i >= 0, `${file}: withAdminAction no longer calls ${fn}`)
    return i
  })
  assert.deepEqual([...order].sort((a, b) => a - b), order, `${file}: guard, step-up, JSON body, then the change and its audit entry in one transaction`)
})

test("adminListRoute checks the session on both the JSON and the CSV path", () => {
  const file = "lib/admin-list.ts"
  const code = codeOnly(readFileSync(join(WEB, file), "utf8"), file)
  const at = /\bexport\s+function\s+adminListRoute\b/.exec(code)
  assert.ok(at, `${file}: adminListRoute not found`)
  const outer = bodyAfter(code, at.index + at[0].length, file)
  const arrow = /return\s+async\s*\(/.exec(outer)
  assert.ok(arrow, `${file}: adminListRoute must return an async handler`)
  const inner = bodyAfter(outer, arrow.index, file)

  const csv = /\bif\s*\(\s*search\.get\(/.exec(inner)
  assert.ok(csv, `${file}: the CSV branch moved; update this test`)
  const open = inner.indexOf("{", closing(inner, inner.indexOf("(", csv.index), file))
  const close = closing(inner, open, file)
  assert.doesNotMatch(inner.slice(0, csv.index), /\bawait\b/, `${file}: nothing may be awaited before the session check`)
  assert.ok(guardFirst(inner.slice(open + 1, close), "requireAdminSession"), `${file}: the CSV export must await requireAdminSession first`)
  assert.ok(guardFirst(inner.slice(close + 1), "requireAdminSession"), `${file}: the JSON list must await requireAdminSession first`)
})

test("every /admin page and the layout check the staff session first", () => {
  const pages = sourceFiles(ADMIN_PAGES, /^(page|layout)\.tsx$/)
  assert.ok(pages.length >= 20, `only ${pages.length} admin pages`)
  for (const path of pages) {
    const file = relative(ADMIN_PAGES, path)
    const src = readFileSync(path, "utf8")
    const code = codeOnly(src, file)
    const at = /\bexport\s+default\s+async\s+function\s+[A-Za-z_$][\w$]*/.exec(code)
    assert.ok(at, `${file}: export the page as \`export default async function\` so it can be checked`)
    assert.ok(importsFrom(src, "@/lib/auth").has("requirePlatformAdmin"), `${file}: import requirePlatformAdmin from @/lib/auth`)
    assert.ok(guardFirst(bodyAfter(code, at.index + at[0].length, file), "requirePlatformAdmin"), `${file}: await requirePlatformAdmin before anything else`)
  }
})

// the checks above must actually catch a forgotten guard
test("the checks fail an unguarded route", () => {
  const AUTH = `import { readJson, requireAdminSession } from "@/lib/auth"\n`
  const ADMIN = `import { withAdminAction } from "@/lib/admin"\n`
  const DISPATCH = `export async function POST(request: Request, route: { params: Promise<P> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}`
  const bad: Record<string, string> = {
    unguarded: `${AUTH}export async function GET() { const rows = await db().query("select 1"); return Response.json(rows) }`,
    late: `${AUTH}export async function GET() { const rows = await listUsers(); await requireAdminSession(); return Response.json(rows) }`,
    commented: `${AUTH}export async function GET() {\n  // await requireAdminSession()\n  return x\n}`,
    quoted: `${AUTH}export async function GET() { const s = "await requireAdminSession()"; return x }`,
    "other wrapper": `export const POST = someOtherWrapper({ action: "x" }, async () => ({}))`,
    "list on POST": `import { adminListRoute } from "@/lib/admin-list"\nexport const POST = adminListRoute({ name: "x" })`,
    "form body": `${AUTH}export async function POST(request: Request) { await requireAdminSession(); const f = await request.formData(); return x }`,
    "not imported": `export async function GET() { await requireAdminSession(); return x }`,
    "local guard": `${AUTH}const requireAdminSession = async () => null\nexport async function GET() { await requireAdminSession(); return x }`,
    "plain action": `${ADMIN}const ACTIONS = { a: withAdminAction({}, h), b: async () => new Response() }\n${DISPATCH}`,
    "action added later": `${ADMIN}const ACTIONS = { a: withAdminAction({}, h) }\nACTIONS["b"] = async () => new Response()\n${DISPATCH}`,
    "work before dispatch": `${ADMIN}const ACTIONS = { a: withAdminAction({}, h) }\n${DISPATCH.replace("const handler", "await db().query(\"x\")\n  const handler")}`,
    "default export": `${AUTH}export default async function handler() { await requireAdminSession() }`,
    "helper export": `${AUTH}export async function GET() { await requireAdminSession(); return x }\nexport function helper() {}`,
  }
  for (const [name, src] of Object.entries(bad)) assert.throws(() => checkRoute(name, src), assert.AssertionError, name)

  const good: Record<string, string> = {
    guarded: `${AUTH}export async function GET() {\n  try {\n    const { user } = await requireAdminSession("support", { write: true })\n    return x\n  } catch {}\n}`,
    write: `${AUTH}export async function POST(request: Request) { const admin = await requireAdminSession(); await readJson(request); return x }`,
    action: `${ADMIN}export const maxDuration = 300\nexport const POST = withAdminAction<P>({ action: "a", targetType: "t" }, async () => ({ targetId: null, before: null, after: null }))`,
    dispatcher: `${ADMIN}const ACTIONS: Record<string, H> = {\n  "a-b": withAdminAction<P>({}, async ({ tx }) => ({})),\n  c: withAdminAction({}, h),\n}\nACTIONS["d"] = withAdminAction({}, h)\n${DISPATCH}`,
  }
  for (const [name, src] of Object.entries(good)) assert.doesNotThrow(() => checkRoute(name, src), name)
})
