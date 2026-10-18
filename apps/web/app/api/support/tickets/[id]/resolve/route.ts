import { resolveAsUser } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"

// Body: {}. The customer marks their own ticket resolved.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    await readJson(request)
    await resolveAsUser(db(), user.id, (await params).id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
