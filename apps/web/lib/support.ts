import { AuthError, hitRateLimit, listSupportStaff, ticketRef, type RateLimit, type TicketMailInfo } from "@apex/db"
import { db } from "@/lib/db"
import { isLocale, type Locale } from "@/lib/i18n/config"
import { sendTicketAssigned, sendTicketReceived, sendTicketReply, sendTicketStaffNotice, type StaffTicketNotice } from "@/lib/mail"
import { siteOrigin } from "@/lib/oauth"

// Support tickets around the database calls (@apex/db support-tickets.ts): spam limits for
// customers, and who gets which email.
//
// Staff emails go to SUPPORT_INBOX_EMAIL (one address or several, comma-separated) when it is set,
// else to every active staff account; they are written in SUPPORT_STAFF_LOCALE (default English).

const LIMITS = {
  // new tickets: per account and per address, on top of Turnstile
  createUser: { max: 5, windowSeconds: 60 * 60 },
  createIp: { max: 10, windowSeconds: 60 * 60 },
  reply: { max: 30, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimit>

async function limit(key: string, rule: RateLimit) {
  const over = await hitRateLimit(db(), `support:${key}`, rule)
  if (over) throw new AuthError("too_many_attempts", "Too many support requests. Try again later", over.retryAfterSeconds)
}

export async function limitNewTicket(userId: string, ip: string | null) {
  await limit(`create:user:${userId}`, LIMITS.createUser)
  if (ip) await limit(`create:ip:${ip}`, LIMITS.createIp)
}

export const limitTicketReply = (userId: string) => limit(`reply:user:${userId}`, LIMITS.reply)

const customerLink = (id: string) => `${siteOrigin()}/dashboard/support/${id}`
const staffLink = (id: string) => `${siteOrigin()}/admin/support/${id}`
const staffLocale = (): Locale => (isLocale(process.env.SUPPORT_STAFF_LOCALE) ? process.env.SUPPORT_STAFF_LOCALE : "en")

async function staffInbox(): Promise<string[]> {
  const configured = (process.env.SUPPORT_INBOX_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  if (configured.length) return configured
  return (await listSupportStaff(db())).map((s) => s.email)
}

// Failures are logged, never thrown: the ticket or reply is saved either way
const quietly = (what: string, work: Promise<unknown>) => work.catch((err: unknown) => console.error(`[support] ${what} email failed`, err))

/** A customer filed a ticket: confirm it to them and tell staff. */
export async function notifyNewTicket(mail: TicketMailInfo, body: string) {
  const t = { ref: ticketRef(mail.ticket.number), subject: mail.ticket.subject }
  const jobs: Promise<unknown>[] = []
  if (mail.customer) jobs.push(sendTicketReceived(mail.customer.email, { ...t, link: customerLink(mail.ticket.id) }, mail.ticket.locale))
  jobs.push(staffNotice("staffNew", mail, body))
  await quietly("new ticket", Promise.all(jobs))
}

/** The customer wrote on their ticket: tell whoever has it, or every staff inbox when nobody does. */
export async function notifyCustomerReply(mail: TicketMailInfo, body: string) {
  await quietly("customer reply", staffNotice("staffReply", mail, body))
}

async function staffNotice(notice: StaffTicketNotice, mail: TicketMailInfo, body: string) {
  const to = mail.assignee ? [mail.assignee.email] : await staffInbox()
  const t = {
    ref: ticketRef(mail.ticket.number),
    subject: mail.ticket.subject,
    link: staffLink(mail.ticket.id),
    body,
    from: mail.customer?.email ?? "—",
    workspace: mail.workspace,
    site: mail.site,
  }
  await Promise.all(to.map((email) => sendTicketStaffNotice(email, notice, t, staffLocale())))
}

/** Staff answered: email the customer in the language they wrote in. */
export async function notifyStaffReply(mail: TicketMailInfo, body: string) {
  if (!mail.customer) return
  const t = { ref: ticketRef(mail.ticket.number), subject: mail.ticket.subject, link: customerLink(mail.ticket.id), body }
  await quietly("staff reply", sendTicketReply(mail.customer.email, t, mail.ticket.locale))
}

/** Someone else gave the ticket to a staff member. */
export async function notifyAssigned(mail: TicketMailInfo) {
  if (!mail.assignee) return
  const t = { ref: ticketRef(mail.ticket.number), subject: mail.ticket.subject, link: staffLink(mail.ticket.id) }
  await quietly("assignment", sendTicketAssigned(mail.assignee.email, t, staffLocale()))
}
