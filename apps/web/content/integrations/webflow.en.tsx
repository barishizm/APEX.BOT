import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Before you start" },
  { id: "site-wide", label: "Add it to every page" },
  { id: "single-page", label: "Or to a single page" },
  { id: "allow", label: "Allow your domains" },
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
      <p>Webflow runs custom code only on sites with a paid site plan.</p>

      <h2 id="site-wide">Add it to every page</h2>
      <ol>
        <li>
          Open your project's <em>Site settings</em> and go to the <em>Custom code</em> tab.
        </li>
        <li>
          Paste the embed code into <strong>Footer code</strong> (the box for code before the <code>&lt;/body&gt;</code>{" "}
          tag).
        </li>
        <li>
          Click <em>Save changes</em>, then <strong>publish</strong> your site. Custom code only runs on the published site,
          not in the Designer.
        </li>
      </ol>

      <h2 id="single-page">Or to a single page</h2>
      <p>
        To show the chat on one page only, open that page's settings in the Designer and paste the snippet into{" "}
        <em>Custom code → Before &lt;/body&gt; tag</em>, then publish. To show it everywhere except a few pages, add it site
        wide and list the exceptions under <em>Behavior → Hide on these pages</em> in your Apex dashboard.
      </p>

      <h2 id="allow">Allow your domains</h2>
      <p>
        Under <em>Allowed websites</em> add your custom domain, with and without <code>www</code>. To test on Webflow's
        staging address first, add <code>https://your-site.webflow.io</code> as well. The widget only runs on the addresses
        listed.
      </p>

      <h2 id="notes">Good to know</h2>
      <ul>
        <li>
          <strong>Knowledge.</strong> Add your published site as a knowledge source. Apex reads your sitemap and linked
          pages, including CMS collection pages, up to your page limit. Re-sync after you publish big changes.
        </li>
        <li>
          <strong>Styling.</strong> The widget renders in a Shadow DOM, so your Webflow styles can't break it. Colors,
          launcher and position are set in the Apex dashboard.
        </li>
        <li>
          <strong>Opening it from a button.</strong> Give a button an ID (for example <code>help</code>) and add{" "}
          <code>
            {`<script>document.getElementById("help").onclick = () => Apex.open()</script>`}
          </code>{" "}
          after the embed code. See the <a href="/docs#javascript-api">JavaScript API</a>.
        </li>
      </ul>
      <p>
        If the launcher doesn't appear, see <a href="/docs#troubleshooting">troubleshooting</a>.
      </p>
    </>
  );
}

export const webflow: MarketingContent = {
  meta: {
    title: "Add an AI chatbot to your Webflow site",
    description:
      "Add Apex Bot's AI support chatbot to a Webflow site in a few minutes with site-wide or page-level custom code. Answers come only from your own pages.",
    crumb: "Webflow",
  },
  eyebrow: "Webflow",
  title: "How to add an AI chatbot to your Webflow site",
  intro:
    "Paste one line into your site's custom code, publish, and Apex Bot answers your visitors from your own Webflow pages.",
  toc: TOC,
  body: Body,
};
