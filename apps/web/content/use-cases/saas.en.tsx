import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Questions it takes off your plate" },
  { id: "sources", label: "Docs, pricing and help center" },
  { id: "in-app", label: "Inside your product" },
  { id: "handoff", label: "When a human is needed" },
  { id: "safety", label: "Safe on a public site" },
  { id: "faq", label: "Questions" },
];

const IN_APP_EXAMPLE = `<script>
  // Open the chat from your own "Help" button
  document.querySelector("#help").addEventListener("click", () => Apex.open())

  // Ask on the visitor's behalf from a pricing tooltip
  Apex.send("What's included in the Pro plan?")

  // Pre-fill the hand-off and contact forms for a signed-in user
  Apex.identify({ name: "Ada", email: "ada@example.com" })

  // Send chat events to your analytics
  Apex.on("handoff", () => analytics.track("support_handoff"))
</script>`;

function Body() {
  return (
    <>
      <h2 id="questions">Questions it takes off your plate</h2>
      <p>
        Software companies answer the same questions every day, before and after the sale. Most are covered in the docs or on
        the pricing page, but visitors don't find them, or don't want to look:
      </p>
      <ul>
        <li>
          <strong>Pre-sales:</strong> Does it integrate with X? Is there a free plan? What's the difference between Pro and
          Business? Where is data stored?
        </li>
        <li>
          <strong>Onboarding:</strong> How do I invite my team? Where do I find my API key? How do I connect my domain?
        </li>
        <li>
          <strong>Troubleshooting:</strong> Why isn't the webhook firing? What does this error mean? How do I reset 2FA?
        </li>
      </ul>
      <p>
        Apex Bot answers these from your own content, with a link to the exact page, so your team spends its time on the
        questions that really need a person.
      </p>

      <h2 id="sources">Docs, pricing and help center</h2>
      <p>
        Point Apex at your marketing site, docs and help center. It reads your sitemap and linked pages on the same domain,
        respects <code>robots.txt</code> and skips navigation, footers and cookie banners. Add text sources for things that
        aren't public yet, like answers your support team gives often.
      </p>
      <p>
        Answers come only from those sources. If your docs don't cover a question, Apex says it doesn't know instead of
        guessing an API parameter or promising a feature on your roadmap.{" "}
        <a href="/grounded-answers">How grounded answers work</a>.
      </p>

      <h2 id="in-app">Inside your product</h2>
      <p>
        The same widget runs in your web app. In single-page apps like React or Next.js, load the script once in your root
        layout; the conversation survives client-side navigation. The <a href="/docs#javascript-api">JavaScript API</a> lets
        your own code control it:
      </p>
      <pre>
        <code>{IN_APP_EXAMPLE}</code>
      </pre>
      <p>
        You can also hide the widget on specific paths, for example your billing pages, under{" "}
        <em>Behavior → Hide on these pages</em>.
      </p>

      <h2 id="handoff">When a human is needed</h2>
      <p>
        Account-specific problems need your team. With hand-off turned on, a visitor can choose “Talk to a human”: the
        question and the whole conversation are emailed to your support address, and when you reply you're talking to them
        directly. Questions the assistant couldn't answer show you which docs to write next.
      </p>

      <h2 id="safety">Safe on a public site</h2>
      <ul>
        <li>
          <strong>Domain locked.</strong> The public site key works only on the domains you allow, so a copied snippet does
          nothing elsewhere.
        </li>
        <li>
          <strong>No actions.</strong> The assistant can't call your API, change accounts or run code. A prompt-injection
          attempt can change what one chat says, nothing more.
        </li>
        <li>
          <strong>Budgets.</strong> Per-visitor rate limits and a daily token budget keep usage predictable, even if a
          script hammers the widget.
        </li>
        <li>
          <strong>Your choice of model.</strong> Claude, OpenAI or Gemini, with an automatic fallback model.
        </li>
      </ul>
      <p>
        Details on the <a href="/security">security page</a>.
      </p>

      <h2 id="faq">Questions</h2>
      <h3>Can it answer questions about a specific user's account?</h3>
      <p>
        No. Apex has no access to your product's data. <code>Apex.identify()</code> only pre-fills the user's name and email
        in the hand-off and contact forms, so they don't have to type them.
      </p>
      <h3>How does it stay current when we ship?</h3>
      <p>
        Re-sync the website source after you publish new docs, and Apex reads them again. Text sources update as soon as you
        save them.
      </p>
      <h3>Can I restrict what it talks about?</h3>
      <p>
        Yes. Add your own instructions for tone, and list topics it should politely decline, such as legal questions or
        unreleased features.
      </p>
    </>
  );
}

export const saas: MarketingContent = {
  meta: {
    title: "AI support chatbot for SaaS",
    description:
      "Answer pre-sales, onboarding and how-to questions from your docs, pricing and help center, with source links, hand-off and an in-app JavaScript API.",
    crumb: "SaaS",
  },
  eyebrow: "For SaaS",
  title: "An AI support chatbot for SaaS that answers from your docs",
  intro:
    "Answer pre-sales, onboarding and how-to questions from your own docs, pricing page and help center, on your website and inside your app.",
  toc: TOC,
  body: Body,
};
