import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "What shoppers ask" },
  { id: "how", label: "How Apex handles them" },
  { id: "orders", label: "Order-specific questions" },
  { id: "setup", label: "Setting it up for a store" },
  { id: "costs", label: "Keeping costs predictable" },
  { id: "faq", label: "Questions" },
];

function Body() {
  return (
    <>
      <h2 id="questions">What shoppers ask</h2>
      <p>
        Most messages an online store gets are variations of the same few questions, and the answers are already on the
        store's own pages:
      </p>
      <ul>
        <li>How long does shipping take, and how much does it cost to my city or country?</li>
        <li>Can I return this, how many days do I have, and who pays for the return?</li>
        <li>Which size should I pick? What is this made of? Does it fit this model?</li>
        <li>Which payment methods do you accept? Can I pay in instalments?</li>
        <li>Do you have a physical store, and when is it open?</li>
      </ul>
      <p>
        Shoppers ask these at night and at weekends, right before they decide to buy. An unanswered question at that moment
        is often an abandoned cart.
      </p>

      <h2 id="how">How Apex handles them</h2>
      <p>
        Apex Bot reads your product, shipping, returns and FAQ pages and answers from them, in the chat widget, at any hour.
        Each answer links the page it came from, so the shopper can check the details and stay on your site.
      </p>
      <ul>
        <li>
          <strong>No invented policies.</strong> Apex only states what your pages say. If your returns page doesn't mention
          a case, the assistant says it doesn't know rather than making up a rule you'd have to honor.{" "}
          <a href="/grounded-answers">How grounded answers work</a>.
        </li>
        <li>
          <strong>Turkish and English.</strong> Shoppers get replies in the language they write in, which helps stores
          selling both in Turkey and abroad.
        </li>
        <li>
          <strong>Lead capture.</strong> Optionally ask for a name, email or phone number before the chat starts, so a
          question can become a follow-up.
        </li>
        <li>
          <strong>Looks like your store.</strong> Brand color, launcher icon, greeting and suggested questions such as
          “Shipping times” or “Return policy” are all settings, with a live preview.
        </li>
      </ul>

      <h2 id="orders">Order-specific questions</h2>
      <p>
        Apex answers questions; it doesn't take actions. It can't look up an order, change an address or issue a refund, and
        it won't pretend to. For “Where is my order #1234?” it can explain how order tracking works from your help pages, and
        offer <strong>hand-off</strong>: the shopper's question and the whole conversation are emailed to your team, and when
        you reply, you're talking to them directly.
      </p>
      <p className="callout">
        Because the assistant has no access to your store's admin or customer data, a visitor who tries to manipulate it
        can't use it to see or change anything. The worst case is one odd chat.
      </p>

      <h2 id="setup">Setting it up for a store</h2>
      <ol>
        <li>
          Add your store's address as a knowledge source. Apex reads your sitemap and linked pages, up to your page limit.
          Make sure shipping, returns, payment and size-guide pages are included.
        </li>
        <li>
          Add a text source for anything that isn't on your website yet, like courier cut-off times or how you handle
          damaged parcels.
        </li>
        <li>Set the greeting and two or three suggested questions your customers ask most.</li>
        <li>
          Paste the embed code into your theme. There are step-by-step guides for{" "}
          <a href="/integrations/shopify">Shopify</a> and <a href="/integrations/wordpress">WordPress / WooCommerce</a>, and
          the <a href="/docs#platforms">docs</a> cover Wix, Squarespace and others.
        </li>
        <li>
          Add both <code>https://yourstore.com</code> and <code>https://www.yourstore.com</code> under{" "}
          <em>Allowed websites</em>. The widget runs only on the addresses you list.
        </li>
      </ol>

      <h2 id="costs">Keeping costs predictable</h2>
      <p>
        A busy store shouldn't get a surprise bill. Every assistant has a per-visitor rate limit, a maximum message length
        and a daily token budget. When the budget is used up, the chat offers hand-off until the next UTC day instead of
        running up costs. Apex is free during the beta; the plans for afterwards are on the{" "}
        <a href="/pricing">pricing page</a>.
      </p>

      <h2 id="faq">Questions</h2>
      <h3>Will it recommend products?</h3>
      <p>
        It can describe and compare products using what your product pages say, and link to them. It doesn't see live stock
        levels or prices that aren't on the pages it read, so re-sync your website after big catalogue changes.
      </p>
      <h3>Does it work on the checkout page?</h3>
      <p>
        It runs wherever your theme loads the embed code. Some platforms, Shopify among them, don't load theme code on the
        checkout pages, so the chat appears on your store pages but not during checkout.
      </p>
      <h3>Is shoppers' data safe?</h3>
      <p>
        Emails, phone numbers and card numbers are masked before anything is written to logs, conversations are deleted
        after the retention period you choose, and the widget sets no cookies. See <a href="/security">security</a> and{" "}
        <a href="/privacy">privacy</a>.
      </p>
    </>
  );
}

export const ecommerce: MarketingContent = {
  meta: {
    title: "AI chatbot for e-commerce stores",
    description:
      "Answer shipping, returns, sizing and payment questions 24/7 with an AI chatbot that only uses your store's own pages. Turkish and English.",
    crumb: "E-commerce",
  },
  eyebrow: "For e-commerce",
  title: "An AI chatbot for online stores that never invents a return policy",
  intro:
    "Answer shipping, returns, sizing and payment questions around the clock, from your own store pages, in Turkish and English.",
  toc: TOC,
  body: Body,
};
