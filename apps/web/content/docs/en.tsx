import { apiUrl, embedSnippet } from "@/lib/site";
import type { ProseContent } from "../types";

const TOC: ProseContent["toc"] = [
  { id: "setup", label: "Setup guide" },
  { id: "knowledge", label: "Knowledge" },
  { id: "customize", label: "Customize" },
  { id: "install", label: "Install the widget" },
  { id: "platforms", label: "Platforms" },
  { id: "javascript-api", label: "JavaScript API" },
  { id: "privacy", label: "Privacy controls" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const API_EXAMPLE = `<script>
  // Optional settings, read when the widget loads
  window.Apex = {
    lang: "auto",                 // "auto", "tr", "en", "lt", "lv" or "et"
    greeting: "Hi! Ask me anything about our store.",
    suggestions: ["Shipping times", "Return policy"],
    theme: { primary: "#312c85", position: "bottom-right" },
  };
</script>`;

const METHODS_EXAMPLE = `Apex.open()                          // open the chat
Apex.close()                         // close it
Apex.toggle()                        // open or close
Apex.send("Where is my order?")      // open and ask a question
Apex.identify({ name: "Ada", email: "ada@example.com" })

Apex.on("message", (m) => console.log(m.text, m.sources))
Apex.on("open", () => analytics.track("chat_opened"))`;

function Body() {
  const snippet = embedSnippet("apex_pk_…");
  return (
    <>
      <h2 id="setup">Setup guide</h2>
      <ol>
        <li>
          <strong>Create your account</strong> and verify your email. Your workspace and your assistant are created
          automatically.
        </li>
        <li>
          <strong>Add knowledge.</strong> Give Apex your website address and it reads your pages. Add text for anything
          that isn't online.
        </li>
        <li>
          <strong>Customize the widget</strong> under <em>Dashboard → Widget</em>: name, colors, greeting, tone and model.
        </li>
        <li>
          <strong>Allow your website</strong> under <em>Install &amp; security</em>. The widget only runs on the addresses
          listed there.
        </li>
        <li>
          <strong>Paste the embed code</strong> into your site and open it to test a conversation.
        </li>
      </ol>
      <p>
        The <em>Setup</em> checklist in your dashboard tracks these steps for you.
      </p>

      <h2 id="knowledge">Knowledge</h2>
      <p>
        Apex only answers from the content you give it. Under <em>Dashboard → Knowledge</em> you can add two kinds of
        source:
      </p>
      <ul>
        <li>
          <strong>Website.</strong> Apex reads the page you enter, your sitemap and the pages they link to on the same
          domain, up to the page limit. It respects <code>robots.txt</code> and skips menus, footers and cookie banners.
          Re-sync it whenever your site changes.
        </li>
        <li>
          <strong>Text.</strong> Paste FAQs, policies or product details that aren't on your website. Give each one a clear
          title; it's shown as the source of answers that use it.
        </li>
      </ul>
      <p>
        When nothing in your knowledge matches a question well enough, the assistant says it doesn't know rather than
        guessing, and offers hand-off to your team if you've turned it on. The <em>Answer confidence</em> setting under{" "}
        <em>Persona</em> controls how close a match must be.
      </p>

      <h2 id="customize">Customize</h2>
      <p>Every setting has a live preview in the widget studio. The most important ones:</p>
      <table>
        <thead>
          <tr>
            <th>Section</th>
            <th>What it controls</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>General</td>
            <td>Bot and company name, header subtitle, default and interface language</td>
          </tr>
          <tr>
            <td>Appearance</td>
            <td>Brand color, theme, launcher icon, label and position, window width, corner radius and font</td>
          </tr>
          <tr>
            <td>Messages</td>
            <td>Greeting, suggested questions, the “I don't know” reply, disclaimer and privacy link</td>
          </tr>
          <tr>
            <td>Behavior</td>
            <td>Auto-open, teaser bubble, sources, feedback, how long chats are remembered and pages to hide on</td>
          </tr>
          <tr>
            <td>AI model</td>
            <td>Provider, model, creativity, answer depth, answer length, memory and a fallback model</td>
          </tr>
          <tr>
            <td>Persona</td>
            <td>Tone, answer length, emoji, your own instructions, topics to decline and answer confidence</td>
          </tr>
          <tr>
            <td>Hand-off &amp; leads</td>
            <td>The email that receives hand-offs and the optional contact form before the chat</td>
          </tr>
        </tbody>
      </table>
      <p>Changes reach your live widget within about a minute of saving.</p>

      <h2 id="install">Install the widget</h2>
      <p>
        Copy the embed code from <em>Dashboard → Widget → Install &amp; security</em>. It has your own site key filled in and
        looks like this:
      </p>
      <pre>
        <code>{snippet}</code>
      </pre>
      <p>
        Paste it just before the closing <code>&lt;/body&gt;</code> tag on every page where the chat should appear. Then add
        each address visitors use, for example <code>https://example.com</code> and <code>https://www.example.com</code>,
        under <em>Allowed websites</em>.
      </p>
      <p className="callout">
        The site key is public by design: it only works on the websites you allow. If it's being misused, rotate it from the
        same screen and update the snippet on your site.
      </p>

      <h2 id="platforms">Platforms</h2>
      <h3>WordPress</h3>
      <p>
        Use a header/footer code plugin (for example <em>WPCode</em>) and add the snippet to the site-wide footer, or paste it
        into your theme's <code>footer.php</code> before <code>&lt;/body&gt;</code>.
      </p>
      <h3>Shopify</h3>
      <p>
        <em>Online Store → Themes → Edit code</em>, open <code>layout/theme.liquid</code> and paste the snippet before{" "}
        <code>&lt;/body&gt;</code>.
      </p>
      <h3>Webflow, Wix and Squarespace</h3>
      <p>
        Add it as site-wide custom code in the footer: <em>Site settings → Custom code</em> (Webflow),{" "}
        <em>Settings → Custom code</em> (Wix) or <em>Settings → Advanced → Code injection</em> (Squarespace).
      </p>
      <h3>React, Next.js and other single-page apps</h3>
      <p>
        Load the script once, for example in your root layout. The widget keeps the conversation across client-side page
        changes on its own.
      </p>

      <h2 id="javascript-api">JavaScript API</h2>
      <p>
        Optionally set <code>window.Apex</code> before the script loads to override a few settings on a specific page:
      </p>
      <pre>
        <code>{API_EXAMPLE}</code>
      </pre>
      <p>
        Once loaded, <code>window.Apex</code> lets your own code control the widget. Calls made before it has loaded are
        queued and run in order.
      </p>
      <pre>
        <code>{METHODS_EXAMPLE}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>When it fires</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>open</code> / <code>close</code>
            </td>
            <td>The chat window opens or closes</td>
          </tr>
          <tr>
            <td>
              <code>message</code>
            </td>
            <td>
              An answer has finished streaming; receives <code>{"{ text, sources }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>lead</code>
            </td>
            <td>
              The visitor submitted the contact form; receives <code>{"{ email, name, phone }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>handoff</code>
            </td>
            <td>The visitor sent a “Talk to a human” request</td>
          </tr>
        </tbody>
      </table>

      <h2 id="privacy">Privacy controls</h2>
      <ul>
        <li>
          Conversations are deleted automatically after the retention period you set under <em>Install &amp; security</em>{" "}
          (30 days by default).
        </li>
        <li>Visitors can start a new chat at any time, which clears the old one from their browser. You can delete any stored conversation from the Conversations page.</li>
        <li>Emails, phone numbers and card numbers are masked in our logs.</li>
        <li>
          Add your privacy policy link under <em>Messages</em> to show it in the widget footer.
        </li>
      </ul>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <h3>The launcher doesn't appear</h3>
      <ul>
        <li>
          Check that the page's exact address (including <code>www</code> and <code>https</code>) is listed under{" "}
          <em>Allowed websites</em>. Your browser console shows <code>[Apex] Widget disabled: origin_not_allowed</code> when
          it isn't.
        </li>
        <li>
          Check the page isn't under one of the paths in <em>Behavior → Hide on these pages</em>.
        </li>
        <li>
          Make sure the snippet's <code>src</code> points to <code>{apiUrl()}/widget.js</code> and that the site key matches
          the one in your dashboard. After rotating the key, the old snippet stops working.
        </li>
      </ul>
      <h3>It says “I don't know” too often</h3>
      <ul>
        <li>
          Check <em>Knowledge</em>: a website source that failed or found few pages shows why.
        </li>
        <li>Add the missing information as a text source.</li>
        <li>
          Set <em>Persona → Answer confidence</em> to <em>Lenient</em> for small knowledge bases.
        </li>
      </ul>
      <h3>Answers stopped</h3>
      <p>
        The daily token budget under <em>Install &amp; security</em> may have run out; the chat offers hand-off until midnight
        UTC. You can also check the <a href="/status">system status</a> page.
      </p>
    </>
  );
}

export const docs: ProseContent = {
  eyebrow: "Docs",
  title: "Set up Apex Bot",
  intro: "Everything you need to go from sign-up to a live assistant on your website. Most sites are done in under ten minutes.",
  toc: TOC,
  body: Body,
};
