// Outgoing email for the human-handoff form.
import { log } from "./log.ts";

export interface Email {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/**
 * Keeps emails in memory and logs that one was sent (masked).
 * shortcut: no email provider chosen yet; swap in a real Mailer (SMTP/Resend/SES) for production.
 */
export class OutboxMailer implements Mailer {
  readonly outbox: Email[] = [];

  async send(email: Email): Promise<void> {
    this.outbox.push(email);
    if (this.outbox.length > 500) this.outbox.shift();
    log("info", "handoff email queued", { to: email.to, subject: email.subject });
  }
}
