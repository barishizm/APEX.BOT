// SQL injection: hostile strings go through every function the public chat API calls, against
// a real Postgres (PGlite), and must come back as plain data with the schema untouched. A static
// check then keeps every query parameterized, so a later change can't splice input into SQL.
import { after, before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import {
  deleteConversation,
  insertConversation,
  insertMessage,
  listConversations,
  loadConversation,
  markConversationHandoff,
  setConversationVisitor,
  setMessageFeedback,
  type ConversationFilter,
} from "../src/conversations.ts"

const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE app.conversations; --",
  "'); DELETE FROM app.messages; --",
  "' UNION SELECT id, content, null, null, null, null, null FROM app.messages --",
  "\\'; truncate app.bots cascade; --",
  "$1; select pg_sleep(5)",
  "E'\\x27' or true",
  "$$ or true $$",
  "/* */ or 1=1",
  "Robert'); DROP TABLE Students;--",
  "' || (select string_agg(email, ',') from app.users) || '",
  "üñíçødé ' \" ` \\ %_ * ?",
]

let pg: PGlite
let db: Db
before(async () => {
  pg = new PGlite()
  db = {
    query: async (t, p) => ({ rows: (p?.length ? await pg.query(t, p) : (await pg.exec(t)).at(-1)!).rows as never[] }),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: async (t, p) => ({ rows: (p?.length ? await tx.query(t, p) : (await tx.exec(t)).at(-1)!).rows as never[] }) })),
    close: () => pg.close(),
  }
  await migrate(db)
})
after(() => db.close())

async function owner(tag: string) {
  const { user } = await register(db, { email: `${tag}@kahve.example`, username: tag, password: "correct horse", accountType: "personal", acceptTerms: true })
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  return { user, bot: await getBotForUser(db, user.id) }
}

async function counts() {
  const { rows } = await db.query<{ c: number; m: number; b: number; u: number }>(
    `select (select count(*)::int from app.conversations) as c, (select count(*)::int from app.messages) as m,
            (select count(*)::int from app.bots) as b, (select count(*)::int from app.users) as u`,
  )
  return rows[0]
}

describe("hostile strings stay data", () => {
  test("lookups with payload ids or bot ids find nothing and change nothing", async () => {
    const { bot } = await owner("lookup")
    const id = randomUUID()
    await insertConversation(db, { id, botId: bot.id, createdAt: new Date() })
    const before = await counts()
    for (const p of PAYLOADS) {
      assert.equal(await loadConversation(db, bot.id, p), null, p)
      assert.equal(await loadConversation(db, p, id), null, p)
      assert.equal(await deleteConversation(db, bot.id, p), false, p)
      assert.equal(await deleteConversation(db, p, id), false, p)
    }
    assert.deepEqual(await counts(), before)
    assert.ok(await loadConversation(db, bot.id, id))
  })

  test("payload content, names and emails round-trip verbatim", async () => {
    const { user, bot } = await owner("roundtrip")
    const id = randomUUID()
    await insertConversation(db, { id, botId: bot.id, origin: PAYLOADS[1], createdAt: new Date() })
    for (const [i, p] of PAYLOADS.entries()) {
      await insertMessage(db, {
        id: randomUUID(),
        conversationId: id,
        botId: bot.id,
        role: i % 2 ? "assistant" : "user",
        content: p,
        sources: [{ url: `https://kahve.example/?q=${p}`, title: p }],
        createdAt: new Date(Date.now() + i),
      })
    }
    await setConversationVisitor(db, bot.id, id, { email: PAYLOADS[0], name: PAYLOADS[2], phone: PAYLOADS[4] })

    const c = (await loadConversation(db, bot.id, id))!
    assert.deepEqual(c.messages.map((m) => m.content), PAYLOADS)
    assert.equal(c.messages[3].sources[0].title, PAYLOADS[3])
    assert.equal(c.origin, PAYLOADS[1])
    assert.deepEqual(c.visitor, { email: PAYLOADS[0], name: PAYLOADS[2], phone: PAYLOADS[4] })
    const listed = (await listConversations(db, user.id)).conversations.find((x) => x.id === id)!
    assert.equal(listed.preview, PAYLOADS[0])
    // the schema is intact: every table the payloads name still answers
    for (const table of ["app.conversations", "app.messages", "app.bots", "app.users"]) {
      await db.query(`select 1 from ${table} limit 1`)
    }
  })

  test("writes addressed with payload ids touch no row", async () => {
    const { bot } = await owner("writes")
    const id = randomUUID()
    const reply = randomUUID()
    await insertConversation(db, { id, botId: bot.id, createdAt: new Date() })
    await insertMessage(db, { id: reply, conversationId: id, botId: bot.id, role: "assistant", content: "ok", createdAt: new Date() })
    const before = await counts()
    for (const p of PAYLOADS.slice(0, 6)) {
      // the API never sends these (it validates ids first); Postgres must still refuse them as uuids
      await assert.rejects(insertMessage(db, { id: randomUUID(), conversationId: p, botId: bot.id, role: "user", content: "x", createdAt: new Date() }))
      await assert.rejects(markConversationHandoff(db, bot.id, p))
      await assert.rejects(setMessageFeedback(db, bot.id, id, p, "down"))
    }
    assert.deepEqual(await counts(), before)
    const c = (await loadConversation(db, bot.id, id))!
    assert.equal(c.handoffAt, null)
    assert.equal(c.messages[0].feedback, null)
  })

  test("one bot's ids never reach another bot's rows", async () => {
    const a = await owner("tenant-a")
    const b = await owner("tenant-b")
    const id = randomUUID()
    await insertConversation(db, { id, botId: a.bot.id, createdAt: new Date() })
    await insertMessage(db, { id: randomUUID(), conversationId: id, botId: a.bot.id, role: "user", content: "secret", createdAt: new Date() })
    assert.equal(await loadConversation(db, b.bot.id, id), null)
    assert.equal(await deleteConversation(db, b.bot.id, id), false)
    // writing into A's conversation under B's id is a no-op
    await insertMessage(db, { id: randomUUID(), conversationId: id, botId: b.bot.id, role: "user", content: "planted", createdAt: new Date() })
    await setConversationVisitor(db, b.bot.id, id, { email: "evil@example.com" })
    await markConversationHandoff(db, b.bot.id, id)
    const c = (await loadConversation(db, a.bot.id, id))!
    assert.deepEqual(c.messages.map((m) => m.content), ["secret"])
    assert.equal(c.visitor, null)
    assert.equal(c.handoffAt, null)
  })

  test("list filters only accept their own names", async () => {
    const { user, bot } = await owner("filters")
    const id = randomUUID()
    await insertConversation(db, { id, botId: bot.id, createdAt: new Date() })
    await insertMessage(db, { id: randomUUID(), conversationId: id, botId: bot.id, role: "user", content: "hi", createdAt: new Date() })
    for (const filter of ["constructor", "__proto__", "toString", "hasOwnProperty", "true or 1=1", "all; drop table app.messages"]) {
      const page = await listConversations(db, user.id, { filter: filter as ConversationFilter })
      assert.deepEqual(page.conversations.map((c) => c.id), [id], filter)
    }
  })
})

// ---------- static check: every query is parameterized ----------

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src")

/** The text of the template literal starting at `start` (a backtick), and its `${...}` expressions. */
function readTemplate(src: string, start: number): { end: number; holes: string[] } {
  const holes: string[] = []
  let i = start + 1
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") i += 2
    else if (src[i] === "$" && src[i + 1] === "{") {
      let depth = 1
      const from = (i += 2)
      while (depth) {
        if (src[i] === "{") depth++
        else if (src[i] === "}") depth--
        i++
      }
      holes.push(src.slice(from, i - 1).trim())
    } else i++
  }
  return { end: i + 1, holes }
}

// Module constants built only from literals (SCREAMING_CASE), plus reviewed exceptions: the list
// filter picked from a fixed map, and the profile update's "column = $n" pairs.
const SAFE_HOLE = /^[A-Z][A-Z0-9_]*$/
const ALLOWED_HOLES: Record<string, string[]> = { "conversations.ts": ["filter"], "auth.ts": ['sets.join(", ")'] }

describe("every query is parameterized", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts"))

  test("no input is interpolated or concatenated into SQL", () => {
    const problems: string[] = []
    let checked = 0
    for (const file of files) {
      const src = readFileSync(join(SRC, file), "utf8")
      for (const m of src.matchAll(/\.query(?:<[^>]*>)?\(\s*/g)) {
        const at = m.index! + m[0].length
        const line = src.slice(0, at).split("\n").length
        checked++
        if (src[at] === "`") {
          const { end, holes } = readTemplate(src, at)
          for (const hole of holes) {
            if (!SAFE_HOLE.test(hole) && !ALLOWED_HOLES[file]?.includes(hole)) problems.push(`${file}:${line} interpolates \${${hole}}`)
          }
          if (/^\s*\+/.test(src.slice(end))) problems.push(`${file}:${line} concatenates onto SQL`)
        } else if (src[at] === '"' || src[at] === "'") {
          const close = src.indexOf(src[at], at + 1)
          if (/^\s*\+/.test(src.slice(close + 1))) problems.push(`${file}:${line} concatenates onto SQL`)
        } else if (!/^(text|sql|statement)\b/.test(src.slice(at))) {
          problems.push(`${file}:${line} passes SQL built elsewhere`)
        }
      }
    }
    assert.ok(checked > 50, `scanned ${checked} queries`)
    assert.deepEqual(problems, [])
  })

  test("the constants spliced into SQL are literals", () => {
    for (const file of files) {
      const src = readFileSync(join(SRC, file), "utf8")
      for (const m of src.matchAll(/^const ([A-Z][A-Z0-9_]*) = (.+)$/gm)) {
        const [, name, value] = m
        // a template constant may only splice other constants
        if (value.startsWith("`")) {
          const { holes } = readTemplate(src, m.index! + m[0].indexOf("`"))
          for (const hole of holes) assert.match(hole, SAFE_HOLE, `${file}: ${name} splices ${hole}`)
        }
      }
    }
  })
})
