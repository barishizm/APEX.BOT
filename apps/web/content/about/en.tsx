import { CONTACT_EMAIL } from "@/components/site-nav";
import type { MarketingContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="what">What Apex Bot is</h2>
      <p>
        Apex Bot is an AI support assistant for websites. It reads your pages, builds a private knowledge base from them and
        answers your visitors' questions in a chat widget, in Turkish and English, at any hour. It answers only from what
        you gave it, links the page each answer came from, and says so when it doesn't know.
      </p>
      <p>
        It is in closed beta. Every feature is free while the beta lasts, and new sign-ups open in waves through the{" "}
        <a href="/signup">waitlist</a>.
      </p>

      <h2 id="why">Why we built it</h2>
      <p>
        Most questions a business gets online are already answered somewhere on its own website: shipping times, return
        rules, opening hours, what a plan includes. Visitors still ask, often outside working hours, and many leave when
        nobody replies. General-purpose chatbots fill that gap badly: they guess, invent policies and sound confident about
        things the business never said.
      </p>
      <blockquote>
        <p>
          “We built Apex so every customer gets an instant, accurate answer at any hour, and support teams can finally focus
          on the hard cases.”
        </p>
        <p>— Mahmut Barış Akıntı, founder and CEO</p>
      </blockquote>

      <h2 id="founder">Who is behind it</h2>
      <p>
        Apex Bot was founded by <strong>Mahmut Barış Akıntı</strong>, who leads the company as CEO and builds the product.
      </p>

      <h2 id="principles">What we hold ourselves to</h2>
      <ul>
        <li>
          <strong>Your content, not the internet.</strong> The assistant answers from your pages and the text you add, and
          from nothing else. <a href="/grounded-answers">How grounded answers work</a> explains the details.
        </li>
        <li>
          <strong>Built like it will be attacked.</strong> A public chatbot is a target, so domain locking, prompt-injection
          hardening, rate limits and daily budgets are on for every site by default. Our{" "}
          <a href="/security">security page</a> lists what the product does today.
        </li>
        <li>
          <strong>Privacy by default.</strong> Personal data is masked in logs, conversations are deleted after the period
          you choose, and your data isn't used to train models unless you opt in. The{" "}
          <a href="/privacy">privacy policy</a> is written to meet Turkey's KVKK and the EU's GDPR.
        </li>
        <li>
          <strong>Turkish as a first language.</strong> Turkish and English are both fully supported, in the answers and in
          every word of the widget.
        </li>
        <li>
          <strong>It answers, it doesn't act.</strong> Apex can't place orders, change accounts or make promises. When a
          visitor needs a person, it hands the conversation to your team by email.
        </li>
      </ul>

      <h2 id="infrastructure">Where it runs</h2>
      <p>
        The chat API runs on Render in Frankfurt, Germany. The website and dashboard are served by Vercel, and accounts and
        settings are stored in a managed PostgreSQL database on Supabase. The full list of providers, and what each one
        sees, is in the <a href="/privacy">privacy policy</a>. You can check the live state of each service on the{" "}
        <a href="/status">status page</a>.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        For questions, partnerships or press, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We read every
        message.
      </p>
    </>
  );
}

export const about: MarketingContent = {
  meta: {
    title: "About us",
    description:
      "Why we built Apex Bot, an AI support assistant that answers only from your own website, and the principles behind it: grounding, security and privacy.",
    crumb: "About",
  },
  eyebrow: "About",
  title: "An AI assistant that only says what your website says",
  intro: "Apex Bot helps businesses answer every visitor, at any hour, without making things up.",
  body: Body,
};
