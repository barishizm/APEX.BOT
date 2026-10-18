import { createTicket, listUserTickets } from "@apex/db"
import { readJson, requestMeta } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { siteScope } from "@/lib/current-site"
import { db } from "@/lib/db"
import { isLocale } from "@/lib/i18n/config"
import { requestLocale } from "@/lib/i18n/server"
import { limitNewTicket, notifyNewTicket } from "@/lib/support"
import { requireHuman } from "@/lib/turnstile"

// The signed-in user's support tickets (/dashboard/support).

export async function GET() {
  try {
    const user = await requireApiUser()
    return Response.json({ tickets: await listUserTickets(db(), user.id) }, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Body: { subject, category, body, context?, botId?, locale?, turnstileToken }. Files it on the site
// the dashboard shows (body.botId, else the site cookie), emails the customer and staff.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const b = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(b.turnstileToken, meta.ip)
    await limitNewTicket(user.id, meta.ip ?? null)
    const scope = await siteScope(user.id, b.botId)
    const botId = typeof scope === "string" ? null : scope.botId
    const body = typeof b.body === "string" ? b.body : ""
    const { ticket, mail } = await createTicket(db(), user.id, {
      subject: b.subject,
      category: b.category,
      body: b.body,
      botId,
      context: b.context,
      locale: isLocale(b.locale) ? b.locale : await requestLocale(),
      userAgent: meta.userAgent,
    })
    await notifyNewTicket(mail, body.trim())
    return Response.json({ ticket: { id: ticket.id, number: ticket.number } }, { status: 201 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
