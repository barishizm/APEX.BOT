import type { Metadata, Viewport } from "next";
import { Inconsolata, Inter, Open_Sans } from "next/font/google";
import "./globals.css";

const display = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Open_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Apex Bot — Sitenizi bilen asistan",
  description:
    "Apex Bot, ziyaretçilerinizin sorularını yalnızca sitenizdeki bilgilere dayanarak yanıtlar. Tek satır kodla kurulur.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c09" },
  ],
};

// Runs before first paint so the saved theme never flashes the wrong colors.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
