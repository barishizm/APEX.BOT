import { listConversations } from "@apex/db"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { parseFilter, summaryJson } from "@/lib/conversations"
import { db } from "@/lib/db"

// ?filter=all|unanswered|handoff|leads|negative&before=<ISO updatedAt of the last item>
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const params = new URL(request.url).searchParams
    const before = params.get("before")
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null
    const page = await listConversations(db(), user.id, { filter: parseFilter(params.get("filter")), before: beforeDate })
    return Response.json({ conversations: page.conversations.map(summaryJson), hasMore: page.hasMore })
  } catch (err) {
    return botErrorResponse(err)
  }
}
