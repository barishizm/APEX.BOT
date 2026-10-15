import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>Who this covers</h2>
      <ul>
        <li>
          <strong>Customers</strong>: people who create an Apex account and set up an assistant. We are the data controller
          for your account data.
        </li>
        <li>
          <strong>Visitors</strong>: people who chat with an assistant on a customer's website. The customer is the data
          controller; we process visitors' data on their behalf.
        </li>
      </ul>

      <h2>What we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Name, username, email, company and password (stored only as a secure hash)</td>
            <td>To create and secure your account</td>
          </tr>
          <tr>
            <td>Sign-in records: time, IP address and browser</td>
            <td>To protect accounts from abuse and unauthorized access</td>
          </tr>
          <tr>
            <td>Your assistant's settings and the content it learns from</td>
            <td>To answer your visitors</td>
          </tr>
          <tr>
            <td>Conversations, feedback and contact details visitors choose to share</td>
            <td>To show the conversation, pass hand-offs and leads to the customer, and improve answers</td>
          </tr>
        </tbody>
      </table>
      <p>We don't sell personal data and we don't use it for advertising.</p>

      <h2>AI providers</h2>
      <p>
        To generate an answer, the visitor's message and the relevant parts of the customer's content are sent to the AI
        provider the customer selected (Anthropic, OpenAI or Google). They process it under their API terms to return the
        answer.
      </p>

      <h2>Model training</h2>
      <p>
        We only use a customer's assistants and conversations to improve our own models if the customer opted in at sign-up.
        The choice can be changed at any time by contacting us.
      </p>

      <h2>How long we keep data</h2>
      <ul>
        <li>Conversations: deleted automatically after the retention period the customer sets (30 days by default).</li>
        <li>Account data: for as long as the account exists, then deleted unless the law requires us to keep it.</li>
        <li>Security logs: kept for a limited time to investigate abuse. Emails, phone and card numbers are masked in them.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        The dashboard uses one essential cookie to keep you signed in, plus a small companion cookie that lets our pages show
        you're signed in. If you pick a language, we remember that choice in a cookie. The chat widget doesn't set cookies;
        it may keep the current conversation in the visitor's browser storage, depending on the customer's settings.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct, export or delete your personal data, or object to how we use it. Visitors should
        contact the website they chatted on first; we'll help that customer respond. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we'll reply within 30 days. You can also complain to your
        data protection authority (in Turkey, the KVKK Authority).
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access is restricted per workspace, and passwords are hashed with scrypt. No system is
        perfectly secure; if a breach affects you, we'll tell you as the law requires.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Legal",
  title: "Privacy Policy",
  intro: "What we collect, why, and the choices you have. Written to meet KVKK (Turkey) and GDPR (EU) expectations.",
  body: Body,
};
