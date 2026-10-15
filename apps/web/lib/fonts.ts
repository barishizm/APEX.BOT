import { Inconsolata, Instrument_Serif, Inter, Open_Sans } from "next/font/google"

const display = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" })
const body = Open_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" })
// Not used above the fold, so they don't compete with the hero for bandwidth
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap", preload: false })
const serif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
  preload: false,
})

export const fontVariables = `${display.variable} ${body.variable} ${mono.variable} ${serif.variable}`
