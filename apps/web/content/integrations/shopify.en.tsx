import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Before you start" },
  { id: "install", label: "Add it to your theme" },
  { id: "allow", label: "Allow your store's domains" },
  { id: "knowledge", label: "What to give it" },
  { id: "notes", label: "Good to know" },
];

function Body() {
  return (
    <>
      <h2 id="before">Before you start</h2>
      <p>
        Copy your embed code from <em>Dashboard → Widget → Install &amp; security</em>. It has your own site key filled in
        and looks like this:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Editing theme code is safe, but it's good practice to duplicate your theme first (<em>… → Duplicate</em>) so you
        have a copy to go back to.
      </p>

      <h2 id="install">Add it to your theme</h2>
      <ol>
        <li>
          In your Shopify admin, go to <em>Online Store → Themes</em>.
        </li>
        <li>
          Next to your current theme, click <em>…</em> and choose <em>Edit code</em>.
        </li>
        <li>
          Under <em>Layout</em>, open <code>theme.liquid</code>.
        </li>
        <li>
          Find the closing <code>&lt;/body&gt;</code> tag near the end of the file and paste the embed code just above it.
        </li>
        <li>
          Click <em>Save</em> and open your store in a new tab. The chat launcher appears on every page.
        </li>
      </ol>

      <h2 id="allow">Allow your store's domains</h2>
      <p>
        Under <em>Allowed websites</em> add every address your store is reached on: your own domain with and without{" "}
        <code>www</code>, and your <code>your-store.myshopify.com</code> address if visitors or you use it. The widget only
        runs on the addresses listed.
      </p>

      <h2 id="knowledge">What to give it</h2>
      <p>
        Add your store's address as a knowledge source. Apex reads your sitemap and the pages it links to, up to your page
        limit. Check that your shipping, refund and payment policies and your FAQ page are included; Shopify's policy pages
        live under <code>/policies/</code>. Add a text source for anything not on your store yet. More ideas in{" "}
        <a href="/use-cases/e-commerce">Apex for e-commerce</a>.
      </p>

      <h2 id="notes">Good to know</h2>
      <ul>
        <li>
          <strong>Checkout.</strong> Shopify doesn't load theme code on its checkout pages, so the chat appears on your store
          pages but not during checkout.
        </li>
        <li>
          <strong>Changing themes.</strong> The snippet lives in the theme. If you publish a different theme, paste it into
          that theme's <code>theme.liquid</code> too.
        </li>
        <li>
          <strong>Orders.</strong> Apex answers from your pages and has no access to your Shopify admin, so it can't look up
          orders. For order questions it can offer hand-off to your team by email.
        </li>
        <li>
          <strong>Hiding it.</strong> To keep the chat off certain pages, add their paths under{" "}
          <em>Behavior → Hide on these pages</em>.
        </li>
      </ul>
      <p>
        If the launcher doesn't appear, see <a href="/docs#troubleshooting">troubleshooting</a>.
      </p>
    </>
  );
}

export const shopify: MarketingContent = {
  meta: {
    title: "Add an AI chatbot to your Shopify store",
    description:
      "Add Apex Bot's AI support chatbot to your Shopify store in a few minutes: paste one line into theme.liquid and answer shipping and returns questions 24/7.",
    crumb: "Shopify",
  },
  eyebrow: "Shopify",
  title: "How to add an AI chatbot to your Shopify store",
  intro:
    "Paste one line of code into your theme and Apex Bot answers your shoppers' questions from your own store pages, in Turkish, English, Lithuanian, Latvian and Estonian.",
  toc: TOC,
  body: Body,
};
