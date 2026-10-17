import { createBot } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser, sitesJson } from "@/lib/bot"
import { selectSite } from "@/lib/current-site"
import { currentBot, currentSites } from "@/lib/dashboard"
import { db } from "@/lib/db"

// The workspace's websites and the one the dashboard is showing
export async function GET() {
  try {
    const user = await requireApiUser()
    const bot = await currentBot(user.id)
    const sites = await currentSites(user.id)
    return Response.json(sitesJson(sites, bot.id))
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Body: { name }. Adds a website with default settings and switches the dashboard to it.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { name } = await readJson(request)
    const bot = await createBot(db(), user.id, name)
    await selectSite(bot.id)
    return Response.json({ id: bot.id, name: bot.name }, { status: 201 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
