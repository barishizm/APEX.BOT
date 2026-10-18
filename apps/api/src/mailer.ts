// Outgoing email for the human hand-off and lead forms.
import { log } from "./log.ts";

export interface Email {
  /** Which mail this is ("handoff", "lead"), for the failure log on /admin/system. */
  kind?: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Keeps emails in memory and logs that one was queued (masked). For development and tests. */
export class OutboxMailer implements Mailer {
  readonly outbox: Email[] = [];

  async send(email: Email): Promise<void> {
    this.outbox.push(email);
    if (this.outbox.length > 500) this.outbox.shift();
    log("info", "email kept in the local outbox (no RESEND_API_KEY)", { to: email.to, subject: email.subject });
  }
}

/** A mail that didn't go out, as handed to `onFailure`; the caller masks it before storing it. */
export interface MailFailure {
  kind: string;
  to: string;
  /** The provider's HTTP status; null when it couldn't be reached. */
  status: number | null;
  error: string;
}

/** Sends through Resend's HTTP API. Failures are logged (and passed to `onFailure`), never thrown at the visitor. */
export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchImpl: typeof fetch = fetch,
    private onFailure?: (failure: MailFailure) => void,
  ) {}

  async send(email: Email): Promise<void> {
    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [email.to], reply_to: email.replyTo, subject: email.subject, text: email.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        // Resend explains a refusal in the body ({"message": ...}); only its first bytes are kept
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        log("error", "email provider refused the message", { status: res.status, to: email.to, detail });
        this.onFailure?.({ kind: email.kind ?? "other", to: email.to, status: res.status, error: detail || `HTTP ${res.status}` });
      } else log("info", "email sent", { to: email.to, subject: email.subject });
    } catch (error) {
      log("error", "couldn't reach the email provider", { error, to: email.to });
      this.onFailure?.({ kind: email.kind ?? "other", to: email.to, status: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env, onFailure?: (failure: MailFailure) => void): Mailer {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM || "Apex Bot <no-reply@apexbot.eu>", fetch, onFailure);
  return new OutboxMailer();
}
