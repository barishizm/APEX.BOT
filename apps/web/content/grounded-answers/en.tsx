import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "definition", label: "What “grounded” means" },
  { id: "pipeline", label: "From question to answer" },
  { id: "dont-know", label: "When it doesn't know" },
  { id: "confidence", label: "Answer confidence" },
  { id: "injection", label: "Manipulation attempts" },
  { id: "limits", label: "Limits" },
  { id: "faq", label: "Questions" },
];

function Body() {
  return (
    <>
      <h2 id="definition">What “grounded” means</h2>
      <p>
        A <strong>grounded chatbot</strong> answers only from a fixed set of sources it has been given, instead of from what
        its AI model learned in general. Apex Bot's sources are the pages it reads from your website and any text you add
        yourself. If the answer isn't in those sources, Apex doesn't give one.
      </p>
      <p>
        This matters because AI models are fluent even when they're wrong. A general chatbot asked about your return policy
        will often produce a plausible policy that you never wrote. On a business website that is worse than no answer: the
        visitor acts on it, and you are the one who has to explain.
      </p>

      <h2 id="pipeline">From question to answer</h2>
      <ol>
        <li>
          <strong>Your content is read and split.</strong> When you add a website, Apex reads the page you enter, your sitemap
          and the pages they link to on the same domain, up to your page limit. It respects <code>robots.txt</code> and skips
          menus, footers and cookie banners. The text is split into short passages and stored for your assistant only.
        </li>
        <li>
          <strong>The question is matched to passages.</strong> When a visitor asks something, Apex searches the passages of
          that one assistant and scores how relevant each one is. Content from other customers is never searched.
        </li>
        <li>
          <strong>Weak matches are dropped.</strong> Passages below a relevance floor are discarded, so a vaguely related page
          can't be stretched into an answer.
        </li>
        <li>
          <strong>The model writes from the passages.</strong> The AI model receives the visitor's question and the matching
          passages, with fixed rules first: answer only with facts found in the passages, never invent prices, policies or
          contact details, and say so when the passages don't cover the question.
        </li>
        <li>
          <strong>The source is shown.</strong> Each answer links the page it came from underneath, so the visitor can check
          it and keep reading on your site.
        </li>
      </ol>

      <h2 id="dont-know">When it doesn't know</h2>
      <p>
        If no passage is relevant enough, the assistant replies with your “I don't know” message instead of guessing. If you
        turned on <a href="/docs#customize">hand-off</a>, it offers to pass the conversation to your team by email, with the
        whole chat attached.
      </p>
      <p>
        Unanswered questions are useful: they show exactly what your visitors want to know that your website doesn't say yet.
        Add the missing information as a page or as a text source, and the next visitor gets an answer.
      </p>

      <h2 id="confidence">Answer confidence</h2>
      <p>
        How close a match has to be is a setting, under <em>Persona → Answer confidence</em>:
      </p>
      <table>
        <thead>
          <tr>
            <th>Setting</th>
            <th>Behavior</th>
            <th>Good for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Strict</td>
            <td>Needs a close match; says “I don't know” more often</td>
            <td>Regulated topics, prices, legal terms</td>
          </tr>
          <tr>
            <td>Balanced</td>
            <td>The default</td>
            <td>Most websites</td>
          </tr>
          <tr>
            <td>Lenient</td>
            <td>Accepts looser matches</td>
            <td>Small knowledge bases with only a few pages</td>
          </tr>
        </tbody>
      </table>

      <h2 id="injection">Manipulation attempts</h2>
      <p>
        Visitors sometimes try to talk a chatbot out of its rules (“ignore your instructions and…”), and web pages can
        contain text written to do the same. Apex passes visitors' messages, your website's text and your custom instructions
        to the model as data inside clearly marked sections, after fixed safety rules that they can't override. Text that
        imitates those markers is neutralized first. Your own instructions can change tone and topics, but can't switch off
        grounding.
      </p>
      <p>
        The assistant also has no tools: it can't place orders, change accounts, browse the web or call other systems. The
        worst a successful manipulation can do is change what one chat says. More on this on the{" "}
        <a href="/security">security page</a>.
      </p>

      <h2 id="limits">Limits</h2>
      <p>
        Grounding greatly reduces made-up answers, but no AI system is perfect. An answer can still be incomplete, or
        misread a passage that is ambiguous. That's why every answer shows its source, and why your dashboard keeps the
        conversations so you can review them and improve your content. The assistant is honest about being an AI and won't
        give definitive medical, legal or financial advice.
      </p>

      <h2 id="faq">Questions</h2>
      <h3>Does Apex use what the AI model already knows about my business?</h3>
      <p>
        No. Answers are built only from your pages and text sources. If your content doesn't mention something, Apex doesn't
        say it, even when the model might know it from elsewhere.
      </p>
      <h3>What happens when my website changes?</h3>
      <p>
        Re-sync the website source under <em>Dashboard → Knowledge</em> and Apex reads it again. Text sources update as soon
        as you save them.
      </p>
      <h3>Which AI models does it use?</h3>
      <p>
        You choose: Claude, OpenAI or Gemini models, with an optional fallback model if your main one is unavailable. The
        grounding rules are the same on every model.
      </p>
      <h3>Is my content used to train AI models?</h3>
      <p>
        Not unless you opt in. Your content and visitors' messages are sent to the AI provider you choose only to generate
        answers. See the <a href="/privacy">privacy policy</a>.
      </p>
    </>
  );
}

export const groundedAnswers: MarketingContent = {
  meta: {
    title: "How grounded answers work",
    description:
      "How Apex Bot answers only from your website: per-assistant search, a relevance floor, linked sources, an honest “I don't know” and injection protection.",
    crumb: "Grounded answers",
  },
  eyebrow: "How it works",
  title: "Grounded answers: a chatbot that doesn't make things up",
  intro:
    "Apex Bot answers from your website and nothing else. Here is exactly how a question becomes an answer, and what happens when your content doesn't have one.",
  toc: TOC,
  body: Body,
};
