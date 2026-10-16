import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="overview">The short version</h2>
      <p>
        A chatbot on your website is public, so we built Apex assuming someone will try to abuse it: to run up your bill, to
        make it say things it shouldn't, to read another customer's data, or to take over an account. These are the
        protections that are on by default. This page describes what the product does today, not aspirations.
      </p>

      <h2 id="widget">Your website and the chat widget</h2>
      <ul>
        <li>
          <strong>Runs only on your websites.</strong> Each assistant has a public site key, but the chat API accepts it only
          from the websites you list. Requests from any other origin are refused, and so are browser pre-flight checks, so a
          copied embed code does nothing elsewhere. The site key is not a secret and gives no access to your account.
        </li>
        <li>
          <strong>Isolated from your page.</strong> The widget renders in a Shadow DOM, so your site's CSS can't break it and
          it doesn't read your page.
        </li>
        <li>
          <strong>No cookies, no tracking.</strong> The widget sets no cookies and no third-party trackers. Depending on your
          setting it remembers only the conversation ID, for the tab, for the browser, or not at all.
        </li>
        <li>
          <strong>Small requests only.</strong> Every request is capped at 16 KB, messages are length-limited (1,000
          characters by default, adjustable) and a conversation has a maximum length.
        </li>
        <li>
          <strong>Responses aren't cached</strong> and are sent with <code>nosniff</code>, so a browser or CDN can't keep or
          reinterpret a visitor's chat.
        </li>
      </ul>

      <h2 id="ai">AI safety</h2>
      <ul>
        <li>
          <strong>Answers come from your content.</strong> The assistant is instructed to answer only with facts found in the
          pages and text you gave Apex, never to invent prices, policies or contact details, and to say it doesn't know when
          nothing relevant is found. When it doesn't know, it can offer to hand the conversation to your team.
        </li>
        <li>
          <strong>Hardened against prompt injection.</strong> Visitors' messages, your website's text and your own custom
          instructions are all passed to the model as data inside clearly marked sections, and the fixed safety rules come
          first and can't be overridden by them. Text that imitates our section markers is neutralized before it reaches the
          model. Your own instructions can shape tone and topics but can't switch off grounding or safety.
        </li>
        <li>
          <strong>No tools, no actions.</strong> The assistant can't place orders, change accounts, run code, browse the web
          or call other systems. The worst a successful manipulation can do is change what one chat says.
        </li>
        <li>
          <strong>Honest about being an AI</strong>, and it won't give definitive medical, legal or financial advice. You can
          also list topics it must politely decline.
        </li>
        <li>
          <strong>Isolated per customer.</strong> Retrieval searches only the content of the assistant being asked, so one
          customer's knowledge is never used to answer on another's site.
        </li>
      </ul>

      <h2 id="abuse">Abuse and cost protection</h2>
      <ul>
        <li>
          <strong>Per-visitor rate limit</strong>: 15 messages a minute per visitor by default, adjustable per assistant (1 to
          120), plus a per-assistant ceiling, so one person or script can't drain your allowance.
        </li>
        <li>
          <strong>Daily token budget</strong> per assistant (2 million by default, up to 20 million), counted in the database
          so it survives restarts. When it's used up, the assistant stops answering until the next UTC day instead of
          running up costs.
        </li>
        <li>
          <strong>Email can't be used as a spam cannon.</strong> Hand-offs are limited per visitor, per assistant and per
          recipient, per hour and per day. A hand-off address must be confirmed with a code sent to it before we email it, so
          nobody can point the system at a stranger's inbox.
        </li>
        <li>
          <strong>Bot checks.</strong> Sign-up, log-in, password reset and the waitlist are protected by Cloudflare Turnstile.
          If the check can't be completed, the request is refused rather than allowed.
        </li>
      </ul>

      <h2 id="accounts">Accounts and sign-in</h2>
      <ul>
        <li>
          <strong>Passwords</strong> are never stored; only a salted scrypt hash (a deliberately slow, memory-hard function)
          is. Minimum length is 8 characters. Hashes can be strengthened later without locking anyone out.
        </li>
        <li>
          <strong>Email verification</strong> is required before the dashboard opens. Codes are six digits, valid for 15
          minutes, stored only as a hash, locked after 5 wrong guesses, and limited in how often they can be requested or
          guessed in an hour.
        </li>
        <li>
          <strong>Brute-force protection.</strong> Failed log-ins are counted per email, per IP address and per both, and
          lock further tries for 15 minutes. An unknown email takes as long to reject as a wrong password, and the error
          message is the same, so the form doesn't reveal which emails have accounts.
        </li>
        <li>
          <strong>Sessions.</strong> The cookie holds a random 256-bit token; our database keeps only its SHA-256 hash, so a
          database leak doesn't hand out live sessions. The cookie is HttpOnly (scripts can't read it), Secure (HTTPS only) and
          SameSite=Lax. A session lasts 24 hours, or 30 days if you choose "keep me signed in".
        </li>
        <li>
          <strong>You stay in control.</strong> Changing or resetting your password signs out every other device. You can also
          sign out all other devices from Settings, and see how many are active.
        </li>
        <li>
          <strong>Google and GitHub sign-in</strong> uses a one-time state value (and PKCE for Google). We accept only an email
          the provider says is verified, so someone can't claim an address they don't own.
        </li>
        <li>
          <strong>Security log.</strong> Sign-ins, failures, resets and password changes are recorded with time, IP address and
          browser, so an incident can be investigated.
        </li>
        <li>
          <strong>Delete your account</strong> yourself, after typing your email to confirm. Workspaces that only you belong to
          are deleted with it.
        </li>
      </ul>

      <h2 id="data">Protecting your data</h2>
      <ul>
        <li>
          <strong>Encryption in transit.</strong> Every connection to the website, dashboard and chat API uses HTTPS, with
          HSTS (two years, including subdomains) so browsers never fall back to plain HTTP. The connection to the database is
          encrypted and the chat API verifies the database's certificate.
        </li>
        <li>
          <strong>Every workspace is separate.</strong> Dashboard queries are always scoped to the signed-in user's
          workspace. Every database table has row-level security enabled with no public policies, so the database's public
          REST interface can't read anything; only our servers, with their own credentials, can.
        </li>
        <li>
          <strong>Codes and tokens are hashed</strong>, not stored in readable form: session tokens, verification and
          password-reset codes, and hand-off confirmation codes.
        </li>
        <li>
          <strong>Personal data stays out of logs.</strong> Email addresses, phone numbers, card numbers (checked with the
          Luhn algorithm) and Turkish, Lithuanian, Latvian and Estonian IBANs are masked before anything is written to our application logs.
        </li>
        <li>
          <strong>Retention you control.</strong> Conversations are deleted automatically after the period you choose (1 to
          365 days, 30 by default) and you can delete any of them yourself from the dashboard.
        </li>
        <li>
          <strong>Training is opt-in.</strong> We use your content to improve our own models only if you said yes, and you can
          change that at any time.
        </li>
        <li>
          <strong>Hosted in the EU where it matters.</strong> The chat API runs in Frankfurt, Germany. See the{" "}
          <a href="/privacy#providers">Privacy Policy</a> for every provider that handles data.
        </li>
      </ul>

      <h2 id="crawler">Reading your website safely</h2>
      <p>
        When you give Apex a URL, our crawler fetches it on your behalf. Because you type the URL, we treat it as untrusted
        input so it can't be used to reach our internal network:
      </p>
      <ul>
        <li>Only <code>http</code> and <code>https</code> on the standard ports (80 and 443); no URLs with embedded credentials.</li>
        <li>
          Only public addresses. Private, loopback, link-local and reserved ranges are blocked, including their IPv6 and
          IPv4-mapped forms, and the check is made on the address actually connected to, which defeats DNS-rebinding tricks.
          Local hostnames such as <code>localhost</code>, <code>.local</code> and <code>.internal</code> are refused.
        </li>
        <li>Every redirect is re-checked, with at most 5 hops. Time and size are capped, including after decompression, to stop zip bombs.</li>
        <li>
          It identifies itself as <code>ApexBot</code> and follows the site's <code>robots.txt</code>.
        </li>
      </ul>

      <h2 id="headers">Browser protections</h2>
      <p>The dashboard and website send the following security headers on every page:</p>
      <ul>
        <li><code>X-Frame-Options: DENY</code> and <code>frame-ancestors 'none'</code>, so the dashboard can't be framed for clickjacking.</li>
        <li><code>Strict-Transport-Security</code> for two years, including subdomains.</li>
        <li><code>X-Content-Type-Options: nosniff</code> and a strict referrer policy.</li>
        <li><code>object-src 'none'</code> and <code>base-uri 'self'</code> in the content security policy.</li>
        <li>A permissions policy that disables camera, microphone and location.</li>
      </ul>
      <p>
        The API only accepts JSON bodies, which a cross-site form can't send without a pre-flight check, and no server
        identification header is exposed.
      </p>

      <h2 id="development">How we build and run it</h2>
      <ul>
        <li>The code that handles sign-in, retrieval, rate limits, the crawler and data masking has automated tests.</li>
        <li>Secrets (API keys, database credentials) live in the hosting providers' secret stores, not in the code.</li>
        <li>Database changes are versioned migrations that are applied automatically and safely re-run.</li>
        <li>Providers we rely on are listed, with what each one receives, in the <a href="/privacy#providers">Privacy Policy</a>.</li>
      </ul>

      <h2 id="shared">What you can do</h2>
      <ul>
        <li>List only the websites that should show the assistant, and review the list when your domains change.</li>
        <li>Use a strong, unique password, or Google or GitHub sign-in, and sign out devices you no longer use.</li>
        <li>Keep private information out of the pages and text you give Apex: assume anything there can be quoted to a visitor.</li>
        <li>Set the retention period and daily budget that fit your site, and use a hand-off address you control.</li>
        <li>Tell your visitors how you handle their data, as KVKK and GDPR require.</li>
      </ul>

      <h2 id="report">Report a vulnerability or incident</h2>
      <p>
        If you think you've found a weakness, or something looks wrong with your account, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Include enough detail to reproduce it. Please give us a
        reasonable chance to fix it before sharing it publicly, and don't access other people's data, disrupt the service or
        run automated scans against production. We'll acknowledge your report and keep you updated.
      </p>
      <p>
        No system is perfectly secure. If a breach affects your data, we'll tell you and the authorities as the law requires.
        For how we handle personal data, see the <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}

export const security: ProseContent = {
  eyebrow: "Trust",
  title: "Security",
  intro: "How Apex protects your account, your visitors' conversations and your website. What's on by default, in plain language.",
  toc: [
    { id: "overview", label: "The short version" },
    { id: "widget", label: "Website and widget" },
    { id: "ai", label: "AI safety" },
    { id: "abuse", label: "Abuse and cost protection" },
    { id: "accounts", label: "Accounts and sign-in" },
    { id: "data", label: "Protecting your data" },
    { id: "crawler", label: "Reading your website" },
    { id: "headers", label: "Browser protections" },
    { id: "development", label: "How we build and run it" },
    { id: "shared", label: "What you can do" },
    { id: "report", label: "Report a vulnerability" },
  ],
  body: Body,
};
