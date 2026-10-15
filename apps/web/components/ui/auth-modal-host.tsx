"use client"

import { usePathname } from "next/navigation"
import Hero from "@/components/ui/hero-button-expendable"

// The home page's Hero owns the auth modal; every other page mounts it on its own
export function AuthModalHost() {
  const path = usePathname()
  if (path === "/" || path === "/login" || path === "/signup") return null
  return <Hero modalOnly />
}
