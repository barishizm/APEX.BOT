import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="who">Who this covers</h2>
      <ul>
        <li>
          <strong>Customers</strong>: people who create an Apex account and set up an assistant, and people on our waitlist. We
          are the data controller for your account data.
        </li>
        <li>
          <strong>Visitors</strong>: people who chat with an assistant on a customer's website. The customer is the data
          controller; we process visitors' data on their behalf and only on their instructions.
        </li>
      </ul>
      <p>
        This policy describes how Apex Bot works today. How we protect the data is explained in more detail on the{" "}
        <a href="/security">Security</a> page.
      </p>

      <h2 id="collect">What we collect</h2>
      <h3>From customers</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Name, username, email, account type, company name and size (business accounts)</td>
            <td>To create and run your account and workspace</td>
          </tr>
          <tr>
            <td>Password, stored only as a salted scrypt hash. Accounts that use Google or GitHub have no password unless you set one</td>
            <td>To sign you in</td>
          </tr>
          <tr>
            <td>
              If you sign in with Google or GitHub: the provider's account ID and your verified email and name. We never see
              your Google or GitHub password and never post anything to your account
            </td>
            <td>To sign you in and link the provider to your account</td>
          </tr>
          <tr>
            <td>When you accepted the Terms, which version, and your choice about model training</td>
            <td>To keep a record of your consent</td>
          </tr>
          <tr>
            <td>Security log: sign-ins, failed sign-ins, verification and password-reset requests, password changes, signing
              out of other devices, and account deletion, each with time, IP address and browser</td>
            <td>To protect accounts, limit guessing and abuse, and investigate incidents</td>
          </tr>
          <tr>
            <td>Active sessions: IP address, browser, and when each was last used</td>
            <td>To keep you signed in and let you sign out other devices</td>
          </tr>
          <tr>
            <td>Your assistant's settings, the websites you allow it on, the pages Apex reads from your website and any text you add</td>
            <td>To answer your visitors</td>
          </tr>
          <tr>
            <td>The hand-off email address you set, and the confirmation code we send to it</td>
            <td>To confirm the address is yours before we email it</td>
          </tr>
          <tr>
            <td>Daily count of AI tokens each assistant uses</td>
            <td>To enforce the daily budget you set and keep costs predictable</td>
          </tr>
          <tr>
            <td>Email address (and the language of the page) if you join the waitlist</td>
            <td>To tell you once, when sign-ups open. We don't use it for anything else</td>
          </tr>
          <tr>
            <td>Billing: the workspace's plan, subscription status and renewal dates, Paddle's customer and subscription IDs, the invoices Paddle issued, and the monthly count of AI replies per workspace. Card and other payment details are entered at Paddle; we never see or store them</td>
            <td>To apply the plan you pay for, bill extra replies you turned on, show invoices and send billing emails</td>
          </tr>
        </tbody>
      </table>

      <h3>From visitors of a customer's website</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Messages the visitor writes and the assistant's replies, with the source pages shown under each answer</td>
            <td>To hold the conversation and show it to the customer</td>
          </tr>
          <tr>
            <td>Thumbs up or down on an answer</td>
            <td>To show the customer which answers need work</td>
          </tr>
          <tr>
            <td>The website address the chat took place on</td>
            <td>To enforce the allowed-websites list and group conversations</td>
          </tr>
          <tr>
            <td>Name, email and phone, only if the visitor chooses to type them (hand-off request or the customer's lead form)</td>
            <td>To pass the request or lead to the customer by email and show it in their dashboard</td>
          </tr>
          <tr>
            <td>The visitor's IP address, held briefly in memory</td>
            <td>To rate-limit messages per visitor. It is not saved with the conversation</td>
          </tr>
        </tbody>
      </table>
      <p>
        We don't sell personal data, we don't use it for advertising, and we don't build advertising profiles. Visitors are
        not asked to create an account, and the widget tells them they are talking to an AI. Visitors should not be asked for
        sensitive information (health, payment cards, ID numbers) through the chat; if one types it anyway, it is handled like
        any other message, and the card, phone, email and IBAN patterns are masked from our logs.
      </p>

      <h2 id="use">How we use data</h2>
      <ul>
        <li>To provide the service: sign you in, answer visitors, deliver hand-offs and leads, show conversations.</li>
        <li>To keep the service safe: rate limits, bot checks, abuse detection and incident investigation.</li>
        <li>To email you: verification and password-reset codes, hand-off and lead notifications, and security notices.</li>
        <li>To bill paid plans: apply the plan, count AI replies against it, charge extra replies you turned on, and email owners about payments, renewals, the end of a beta plan and usage.</li>
        <li>To improve our own models, only if you opted in (see below).</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>
        Legal bases (GDPR) and conditions (KVKK): performing our contract with you; our legitimate interest in security and
        preventing abuse; your consent where we ask for it (model training, waitlist); and legal obligations. For visitors'
        data, the customer decides the purpose and legal basis.
      </p>

      <h2 id="providers">Who else handles data</h2>
      <p>
        We use a small number of service providers (sub-processors), each only for the job listed. We don't give them more
        than that job needs.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>What for</th>
            <th>Data involved</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, OpenAI or Google (the one the customer selected for that assistant)</td>
            <td>Generating answers</td>
            <td>The visitor's message, recent messages of the conversation and the relevant parts of the customer's content. If the customer selects a Gemini model, the note on Google's unpaid tier in the next row applies to this data too</td>
          </tr>
          <tr>
            <td>Google (Gemini API)</td>
            <td>Search: turning the customer's content and visitors' questions into vectors so the assistant finds the right pages</td>
            <td>The text of the customer's pages and added content, and the visitor's message (with the previous one for follow-up questions). We store the resulting vectors in our own database. While we use Google's unpaid tier, Google's terms allow it to use this data to improve its products</td>
          </tr>
          <tr>
            <td>Supabase (managed PostgreSQL)</td>
            <td>Database</td>
            <td>Everything we store: accounts, settings, knowledge, conversations</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Hosting the website and dashboard</td>
            <td>Requests to the website, including IP addresses</td>
          </tr>
          <tr>
            <td>Render (Frankfurt, Germany)</td>
            <td>Hosting the chat API that the widget talks to</td>
            <td>Chat requests and the conversation in progress</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Sending email</td>
            <td>Recipient address and the content of the message (codes, hand-offs, leads)</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>Telling humans from bots on sign-up, log-in, password reset and the waitlist</td>
            <td>A challenge token, your IP address and browser signals needed to run the check</td>
          </tr>
          <tr>
            <td>Google and GitHub</td>
            <td>"Sign in with" buttons, only if you use them</td>
            <td>What the provider sends back (see above)</td>
          </tr>
          <tr>
            <td>Paddle (Paddle.com Market Ltd, United Kingdom)</td>
            <td>Reseller and merchant of record for paid plans: checkout, payment, invoices, tax, refunds and fraud checks</td>
            <td>Name, email address, billing country and address, VAT number if you give one, payment details (held by Paddle only), what was bought and the workspace's ID. As the seller, Paddle is also an independent controller for the data it collects at checkout, under its own <a href="https://www.paddle.com/legal/privacy">privacy notice</a></td>
          </tr>
        </tbody>
      </table>
      <p>
        AI providers process the data under their API terms to return the answer. Some providers are based outside Turkey and the EU/EEA, so data
        may be transferred abroad; where required we rely on the safeguards the law provides, such as standard contractual
        clauses, and on the provider's own commitments. We may also disclose data when a court or authority legally requires
        it.
      </p>

      <h2 id="training">Model training</h2>
      <p>
        We only use a customer's assistants and conversations to improve our own models if the customer opted in at sign-up.
        The default is no. You can change this at any time in the dashboard under Settings, or by contacting us; it affects
        data going forward. This choice covers our own models; what Google may do with data on its unpaid tier is described in
        the table of service providers above.
      </p>

      <h2 id="retention">How long we keep data</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>How long</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Conversations and the contact details inside them</td>
            <td>
              Deleted automatically once idle for the retention period the customer sets, from 1 to 365 days (30 by
              default). The customer can delete any conversation sooner from the dashboard, and a visitor can ask the customer to erase their chat
            </td>
          </tr>
          <tr>
            <td>Sessions</td>
            <td>24 hours for a browser session, 30 days with "keep me signed in". Signing out, changing your password or resetting it ends them early</td>
          </tr>
          <tr>
            <td>Verification and reset codes</td>
            <td>Valid for 15 minutes; stored only as a hash</td>
          </tr>
          <tr>
            <td>Account data, settings and knowledge</td>
            <td>As long as the account exists. When you delete the account they are deleted too, unless the law requires us to keep something</td>
          </tr>
          <tr>
            <td>Security log</td>
            <td>
              Kept so we can investigate abuse and incidents. When you delete your account the entries are unlinked from it, and
              you can ask us to erase the ones that carry your email address or IP address (we may keep what the law requires)
            </td>
          </tr>
          <tr>
            <td>Waitlist email</td>
            <td>Until sign-ups open and we've told you, or until you ask us to remove it</td>
          </tr>
          <tr>
            <td>Daily token counts</td>
            <td>With the assistant they belong to</td>
          </tr>
          <tr>
            <td>Application logs</td>
            <td>A limited time, with emails, phone numbers, card numbers and IBANs masked before they're written</td>
          </tr>
          <tr>
            <td>Billing records (subscriptions, invoices, charges)</td>
            <td>As long as tax and accounting law requires, which can be after the account is deleted. Monthly AI reply counts stay with the workspace</td>
          </tr>
        </tbody>
      </table>
      <p>
        Data held by our providers can remain in their backups for a short extra period after we delete it, and is removed
        when those backups rotate.
      </p>

      <h2 id="cookies">Cookies and browser storage</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>What it does</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>apex_session</td>
            <td>Keeps you signed in. Strictly necessary; HttpOnly, so page scripts can't read it</td>
            <td>Browser session, or 30 days if you chose "keep me signed in"</td>
          </tr>
          <tr>
            <td>apex_signed_in</td>
            <td>A harmless flag that lets our public pages show "Dashboard" instead of "Log in". Contains no personal data</td>
            <td>Same as the session</td>
          </tr>
          <tr>
            <td>Language cookie</td>
            <td>Remembers the language you picked</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td>apex_oauth</td>
            <td>Protects a Google or GitHub sign-in in progress. Single use</td>
            <td>10 minutes</td>
          </tr>
        </tbody>
      </table>
      <p>
        We use no advertising or analytics cookies. The chat widget sets no cookies; depending on the customer's settings it
        keeps only the current conversation's ID in the visitor's browser (for the tab, for the browser, or not at all). When
        Cloudflare Turnstile runs, it may use its own storage to do its job.
      </p>

      <h2 id="rights">Your rights</h2>
      <p>
        You can ask to know whether we process your data, access it, correct it, export it, delete it, restrict or object to
        how we use it, or withdraw consent (KVKK article 11 and GDPR).
      </p>
      <ul>
        <li>
          <strong>Delete your account yourself</strong> in the dashboard under Settings. It removes your account, and any
          workspace you were the only member of, with its assistants, knowledge and conversations.
        </li>
        <li>
          <strong>Control your sessions</strong>: change your password and sign out every other device from Settings.
        </li>
        <li>
          <strong>Visitors</strong> should contact the website they chatted on to see or erase their conversation; we help
          that customer respond.
        </li>
        <li>
          For anything else, including a copy of your data, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We
          reply within 30 days. We may need to verify it's you before acting.
        </li>
      </ul>
      <p>
        You can also complain to your data protection authority (in Turkey, the Personal Data Protection Authority, KVKK; in
        the EU, the authority in your country).
      </p>

      <h2 id="customers">If you are a customer: your duties</h2>
      <p>
        You are the controller of your visitors' data. That means you decide what the assistant collects, you need a lawful
        basis for it, and you must give your visitors the notices KVKK, GDPR or similar laws require (the widget can show a
        disclaimer line with links to your own policy). Pick a retention period that matches what you tell them. If we are
        asked about a visitor's data, we'll refer them to you and help you respond. Our{" "}
        <a href="/terms">Terms of Service</a> cover this too.
      </p>

      <h2 id="security">Security</h2>
      <p>
        Data is encrypted in transit, access is restricted per workspace, passwords are hashed with scrypt and the
        assistant only answers on the websites you allow. The <a href="/security">Security page</a> explains this in detail.
        No system is perfectly secure; if a breach affects you, we'll tell you and the authorities as the law requires.
      </p>

      <h2 id="children">Children</h2>
      <p>
        Apex is for businesses and adults. We don't knowingly collect data from children under 16 to run an account. If you
        think a child has given us data, contact us and we'll delete it.
      </p>

      <h2 id="changes">Changes and contact</h2>
      <p>
        We'll update this page as the product changes and notify account holders of material changes before they take effect.
        The date of the latest change is at the top. Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Legal",
  title: "Privacy Policy",
  intro: `Version ${TERMS_VERSION}. What we collect, why, who else sees it, how long we keep it and the choices you have. Written to meet KVKK (Turkey) and GDPR (EU) expectations.`,
  toc: [
    { id: "who", label: "Who this covers" },
    { id: "collect", label: "What we collect" },
    { id: "use", label: "How we use data" },
    { id: "providers", label: "Who else handles data" },
    { id: "training", label: "Model training" },
    { id: "retention", label: "How long we keep data" },
    { id: "cookies", label: "Cookies and storage" },
    { id: "rights", label: "Your rights" },
    { id: "customers", label: "If you are a customer" },
    { id: "security", label: "Security" },
    { id: "children", label: "Children" },
    { id: "changes", label: "Changes and contact" },
  ],
  body: Body,
};
