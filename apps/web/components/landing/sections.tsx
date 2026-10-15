import {
  BookOpenText,
  Cpu,
  Gauge,
  Globe,
  Languages,
  LifeBuoy,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Timer,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { CopySnippet } from "@/components/copy-snippet";
import { RegisterButton } from "@/components/ui/login-button";
import { WidgetShowcase } from "@/components/landing/widget-showcase";
import { embedSnippet } from "@/lib/site";

const STEPS = [
  {
    title: "Point it at your website",
    text: "Apex reads your pages and builds a private knowledge base. Add text for anything that isn't online yet, like internal FAQs.",
  },
  {
    title: "Make it yours",
    text: "Name, colors, launcher, greeting, tone, the AI model and topics to avoid. A live preview shows every change before you save.",
  },
  {
    title: "Paste one line",
    text: "Add the script tag before </body>. It works on WordPress, Shopify, Webflow or plain HTML, and only on the domains you allow.",
  },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: BookOpenText,
    title: "Grounded in your content",
    text: "Answers come only from your own pages, with the source linked underneath. If your content doesn't cover it, Apex says so instead of guessing.",
  },
  {
    icon: Languages,
    title: "Turkish and English",
    text: "Visitors get replies in the language they write in, and every word of the widget is translated.",
  },
  {
    icon: LifeBuoy,
    title: "Human hand-off",
    text: "“Talk to a human” emails your team the visitor's question and the whole conversation. Reply and you're talking to them.",
  },
  {
    icon: UserPlus,
    title: "Lead capture",
    text: "Ask for a name, email or phone before the chat starts, as an optional or required step.",
  },
  {
    icon: Cpu,
    title: "Your choice of model",
    text: "Run on Claude, OpenAI or Gemini models, with an automatic fallback if your main model is unavailable.",
  },
  {
    icon: Gauge,
    title: "Cost guardrails",
    text: "Per-visitor rate limits, a maximum message length and a daily token budget keep usage predictable.",
  },
];

const SECURITY: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Globe,
    title: "Runs only on your domains",
    text: "The public site key works only on the websites you list. A copied embed code does nothing anywhere else.",
  },
  {
    icon: ShieldCheck,
    title: "Hardened against prompt injection",
    text: "Your site content and visitors' messages are handled as data, never as instructions, so they can't rewrite the assistant's rules.",
  },
  {
    icon: LockKeyhole,
    title: "Personal data stays out of logs",
    text: "Emails, phone numbers and card numbers are masked before anything is written to our logs.",
  },
  {
    icon: Timer,
    title: "Retention you control",
    text: "Conversations are deleted automatically after the period you choose, and you can delete any of them from your dashboard (KVKK / GDPR).",
  },
];

const FAQ = [
  {
    q: "Do I need to write code?",
    a: "No. You paste a single script tag into your site, the same way you'd add analytics. Most site builders have a “custom code” box for exactly this.",
  },
  {
    q: "Where do the answers come from?",
    a: "Only from the content you give Apex: the pages it reads from your website and any text you add yourself. It doesn't use general web knowledge about your business.",
  },
  {
    q: "What happens when it doesn't know the answer?",
    a: "It says it doesn't know and, if you turned on hand-off, offers to pass the conversation to your team by email. Questions it couldn't answer show you what to add to your content.",
  },
  {
    q: "Which languages does it speak?",
    a: "Turkish and English. The assistant replies in the visitor's language, and the widget interface follows the visitor's browser or a default you pick.",
  },
  {
    q: "Is my data used to train AI models?",
    a: "Not unless you opt in when you create your account. Messages are sent to the AI provider you choose only to generate answers.",
  },
  {
    q: "How much does it cost?",
    a: "Apex is free while it's in beta. See the pricing page for the plans we'll offer afterwards.",
  },
];

function SectionHead({ eyebrow, title, text, center }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? "section-head section-head--center" : "section-head"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {text && <p className="section-head__text">{text}</p>}
    </div>
  );
}

export function LandingSections({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <section id="how-it-works" className="section-block" aria-labelledby="how-title">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">Live on your site in three steps</h2>
        </div>
        <ol className="grid3 steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="steps__n">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="section-block">
        <SectionHead
          eyebrow="Features"
          title="Everything a support assistant needs, nothing it shouldn't do"
          text="Apex answers questions. It doesn't place orders, change accounts or make promises your content doesn't back up."
        />
        <ul className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="feature">
              <span className="feature__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="widget" className="section-block showcase">
        <div className="showcase__copy">
          <SectionHead
            eyebrow="Chat widget"
            title="Looks like your brand, not like ours"
            text="Every detail is a setting in your dashboard, with a live preview. Try it here in both languages."
          />
          <ul className="checks">
            <li>Brand color, launcher icon or your own image, position and size</li>
            <li>Greeting, suggested questions and the “I don't know” reply</li>
            <li>Tone, answer length and your own instructions</li>
            <li>Auto-open, pages to hide on and how long to remember a chat</li>
            <li>Shadow DOM isolation, so your site's CSS can't break it</li>
          </ul>
        </div>
        <WidgetShowcase />
      </section>

      <section id="security" className="section-block">
        <SectionHead
          eyebrow="Security & privacy"
          title="A public chatbot, built like it will be attacked"
          text="Because it will be. These protections are on for every site, by default."
        />
        <ul className="feature-grid feature-grid--two">
          {SECURITY.map(({ icon: Icon, title, text }) => (
            <li key={title} className="feature">
              <span className="feature__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="install" className="section-block">
        <SectionHead eyebrow="Install" title="One line of code" text="Your dashboard gives you this snippet with your own site key filled in." />
        <CopySnippet code={embedSnippet("YOUR_SITE_KEY")} />
        <p className="install-note">
          <ScanSearch size={16} aria-hidden="true" />
          <span>
            Step-by-step instructions for each platform are in the <a href="/docs#platforms">setup guide</a>.
          </span>
        </p>
      </section>

      <section id="faq" className="section-block">
        <SectionHead eyebrow="FAQ" title="Questions, answered" />
        <div className="faq">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="faq__item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">Give your visitors answers tonight.</h2>
        <p className="lede">Set up takes a few minutes. Free while Apex is in beta.</p>
        <div className="actions">
          {signedIn ? (
            <a href="/dashboard" className="btn btn--primary">
              Go to your dashboard
            </a>
          ) : (
            <RegisterButton className="btn btn--primary">Create your assistant</RegisterButton>
          )}
          <a href="/docs" className="btn btn--ghost">
            Read the docs
          </a>
        </div>
      </section>
    </>
  );
}
