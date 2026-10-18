import { analyticsData } from "@apex/db"
import { isImpersonating } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { analyticsJson } from "@/lib/analytics"
import { db } from "@/lib/db"
import { siteScope } from "@/lib/current-site"

// ?days=7|30|90&tz=<IANA zone>; anything else falls back to 30 days in UTC
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const params = new URL(request.url).searchParams
    const data = await analyticsData(db(), await siteScope(user.id), { days: params.get("days"), timeZone: params.get("tz") })
    return Response.json(analyticsJson(data, { masked: await isImpersonating() }), { headers: { "cache-control": "private, no-store" } })
  } catch (err) {
    return botErrorResponse(err)
  }
}
