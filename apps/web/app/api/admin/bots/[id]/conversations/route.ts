import { supportListConversations } from "@apex/db"
import { adminErrorResponse } from "@/lib/admin"
import { requireAdminSession } from "@/lib/auth"
import { parseDays, parseFilter, summaryJson } from "@/lib/conversations"
import { db } from "@/lib/db"

// GET ?filter=&days=&before=: the bot's inbox for a staff member with open support access, the
// visitor's details masked. No search (see supportListConversations).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminSession()
    const query = new URL(request.url).searchParams
    const before = query.get("before")
    const page = await supportListConversations(db(), admin.user.id, (await params).id, {
      filter: parseFilter(query.get("filter")),
      days: parseDays(query.get("days")),
      before: before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null,
    })
    return Response.json({ conversations: page.conversations.map(summaryJson), hasMore: page.hasMore })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
