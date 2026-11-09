import { Inconsolata, Inter } from "next/font/google"

// One family for headings, body and product UI. The opsz axis switches Inter to its display
// cut at heading sizes (tighter spacing, finer details) and keeps small UI text open.
// globals.css maps --font-display and --font-body onto this variable.
const sans = Inter({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-sans", display: "swap" })
// Not used above the fold, so it doesn't compete with the hero for bandwidth
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap", preload: false })

export const fontVariables = `${sans.variable} ${mono.variable}`
