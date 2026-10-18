import { listConversations, maskConversationSummary } from "@apex/db"
import { isImpersonating } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { parseDays, parseFilter, parseSearch, summaryJson } from "@/lib/conversations"
import { db } from "@/lib/db"
import { siteScope } from "@/lib/current-site"

// ?filter=all|unanswered|handoff|leads|negative&days=<1-365>&q=<search>&before=<ISO updatedAt of the last item>
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const params = new URL(request.url).searchParams
    const before = params.get("before")
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null
    const page = await listConversations(db(), await siteScope(user.id), {
      filter: parseFilter(params.get("filter")),
      days: parseDays(params.get("days")),
      search: parseSearch(params.get("q")),
      before: beforeDate,
    })
    // a superadmin viewing as the user sees the visitors' details masked
    const masked = await isImpersonating()
    return Response.json({ conversations: page.conversations.map((c) => summaryJson(masked ? maskConversationSummary(c) : c)), hasMore: page.hasMore })
  } catch (err) {
    return botErrorResponse(err)
  }
}
