import type { Metadata, Viewport } from "next";
import { Inconsolata, Instrument_Serif, Inter, Open_Sans } from "next/font/google";
import "./globals.css";

const display = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Open_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap" });

const serif = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Apex Bot — The assistant that knows your site",
  description:
    "Apex Bot answers your visitors' questions using only the information on your site. Installs with a single line of code.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c09" },
  ],
};

// Runs before first paint so the saved theme never flashes the wrong colors.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="dark")}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
