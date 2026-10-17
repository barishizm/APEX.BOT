import { after } from "next/server"
import { KnowledgeError, startScheduledSync } from "@apex/db"
import { db } from "@/lib/db"
import { crawlInto, cronAuthorized } from "@/lib/knowledge"

export const maxDuration = 300

// One website of the daily refresh; answers at once and reads the site after the response
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
  try {
    const source = await startScheduledSync(db(), (await params).id)
    after(() => crawlInto(source.id, source.url))
    return new Response(null, { status: 202 })
  } catch (err) {
    // busy: a manual sync is running, or the bot's other websites are; tomorrow's run tries again
    if (err instanceof KnowledgeError) return new Response(null, { status: err.code === "busy" ? 409 : 404 })
    throw err
  }
}
