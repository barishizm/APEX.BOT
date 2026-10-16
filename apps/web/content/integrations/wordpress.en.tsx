import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Before you start" },
  { id: "plugin", label: "Option 1: a code plugin" },
  { id: "theme", label: "Option 2: your theme" },
  { id: "allow", label: "Allow your domain" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

function Body() {
  return (
    <>
      <h2 id="before">Before you start</h2>
      <p>
        You need your embed code from <em>Dashboard → Widget → Install &amp; security</em>. It has your own site key filled
        in and looks like this:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Add your website as a knowledge source first, so the assistant has something to answer from the moment it appears.
        On WordPress.com, adding code or plugins needs a plan that allows plugins; self-hosted WordPress has no such limit.
      </p>

      <h2 id="plugin">Option 1: a code plugin (recommended)</h2>
      <p>A header and footer plugin keeps the snippet safe from theme updates and works with every theme.</p>
      <ol>
        <li>
          In your WordPress admin, go to <em>Plugins → Add New</em>, search for <strong>WPCode</strong>, then install and
          activate it.
        </li>
        <li>
          Open <em>Code Snippets → Header &amp; Footer</em>.
        </li>
        <li>
          Paste the embed code into the <strong>Footer</strong> box and click <em>Save Changes</em>.
        </li>
        <li>Open your site in a new tab. The chat launcher appears in the corner you chose.</li>
      </ol>

      <h2 id="theme">Option 2: your theme</h2>
      <p>
        With a classic theme, go to <em>Appearance → Theme File Editor</em>, open <code>footer.php</code> and paste the
        snippet just before <code>&lt;/body&gt;</code>. Use a child theme, or the snippet disappears the next time the theme
        updates. Block themes don't have a <code>footer.php</code>; use the plugin option instead.
      </p>

      <h2 id="allow">Allow your domain</h2>
      <p>
        Under <em>Allowed websites</em> add every address visitors use, for example <code>https://example.com</code> and{" "}
        <code>https://www.example.com</code>. The widget only runs on the addresses listed, so a copied snippet does nothing
        on someone else's site.
      </p>

      <h2 id="woocommerce">WooCommerce</h2>
      <p>
        WooCommerce stores install the same way. Make sure your shipping, returns and payment pages are part of the
        knowledge source, and add a text source for anything they don't cover. See{" "}
        <a href="/use-cases/e-commerce">Apex for e-commerce</a> for what works well in a store.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <ul>
        <li>
          <strong>The launcher doesn't show.</strong> Open the browser console. <code>[Apex] Widget disabled:
          origin_not_allowed</code> means the exact address, including <code>www</code> and <code>https</code>, is missing
          from <em>Allowed websites</em>.
        </li>
        <li>
          <strong>It worked, then stopped after a cache plugin.</strong> Clear the cache. If you use JavaScript “delay” or
          “combine” features (WP Rocket, LiteSpeed Cache, Autoptimize and similar), exclude <code>widget.js</code> from them.
        </li>
        <li>
          <strong>It shows on pages where it shouldn't.</strong> Add those paths under{" "}
          <em>Behavior → Hide on these pages</em>.
        </li>
      </ul>
      <p>
        More in the <a href="/docs#troubleshooting">docs</a>.
      </p>
    </>
  );
}

export const wordpress: MarketingContent = {
  meta: {
    title: "Add an AI chatbot to WordPress",
    description:
      "Add Apex Bot's AI support chatbot to any WordPress or WooCommerce site in a few minutes, with a code plugin or your theme. Step-by-step guide.",
    crumb: "WordPress",
  },
  eyebrow: "WordPress",
  title: "How to add an AI chatbot to your WordPress site",
  intro:
    "Apex Bot works on any WordPress or WooCommerce site. Paste one line of code with a plugin or in your theme, and your visitors get answers from your own pages.",
  toc: TOC,
  body: Body,
};
