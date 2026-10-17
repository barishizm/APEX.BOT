import { BotError, getBotForUser } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { selectSite } from "@/lib/current-site"
import { db } from "@/lib/db"

// Switches the dashboard to this website. JSON body required so a cross-site form can't trigger it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    await readJson(request)
    const { id } = await params
    const bot = await getBotForUser(db(), { userId: user.id, botId: id })
    if (bot.id !== id) throw new BotError("not_found", "This website was removed. Reload to see your websites")
    await selectSite(bot.id)
    return Response.json({ id: bot.id, name: bot.name })
  } catch (err) {
    return botErrorResponse(err)
  }
}
