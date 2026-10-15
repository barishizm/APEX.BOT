import type { Metadata, Viewport } from "next";
import { Inconsolata, Instrument_Serif, Inter, Open_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const display = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Open_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap" });

const serif = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Apex Bot — The assistant that knows your site", template: "%s — Apex Bot" },
  description:
    "Apex Bot answers your visitors' questions using only the information on your site. Installs with a single line of code.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c09" },
  ],
};

// Runs before first paint so the saved theme never flashes the wrong colors. The `dark`
// class drives Tailwind's dark: utilities, so it also follows the OS when nothing is saved.
const themeScript = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("theme")}catch(e){}if(t==="light"||t==="dark")d.dataset.theme=t;d.classList.toggle("dark",t==="dark"||(t!=="light"&&m.matches))}a();m.addEventListener("change",function(){if(!d.dataset.theme)a()})})()`;

// Our own Apex widget on the marketing site; unset NEXT_PUBLIC_APEX_WIDGET_SRC to hide it.
const widgetSrc = process.env.NEXT_PUBLIC_APEX_WIDGET_SRC;
const widgetSiteKey = process.env.NEXT_PUBLIC_APEX_SITE_KEY ?? "apex_pk_demo";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {widgetSrc && <Script src={widgetSrc} data-site-key={widgetSiteKey} strategy="afterInteractive" />}
      </body>
    </html>
  );
}
