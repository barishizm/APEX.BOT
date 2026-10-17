import { Inconsolata, Inter, Open_Sans } from "next/font/google"

const display = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" })
const body = Open_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" })
// Not used above the fold, so it doesn't compete with the hero for bandwidth
const mono = Inconsolata({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap", preload: false })

export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`
