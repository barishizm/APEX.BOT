import { currentSignupsMode } from "@/lib/signups"

// GET /api/auth/signups → { mode }. The auth modal asks when it opens, since the public pages are
// prerendered and the mode changes at runtime (lib/signups.ts).
export async function GET() {
  return Response.json({ mode: await currentSignupsMode() }, { headers: { "cache-control": "no-store" } })
}
