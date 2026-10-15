"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { flushSync } from "react-dom"

import { Moon, Sun } from "lucide-react"

import { motion, AnimatePresence } from "framer-motion"

import { useI18n } from "@/components/i18n/provider"
import { cn } from "@/lib/utils"

type AnimatedThemeTogglerProps = {
  className?: string
}

// The app themes via `data-theme` (with a prefers-color-scheme fallback); the `dark`
// class is kept in sync so Tailwind `dark:` utilities work too.
const isDark = () => {
  const root = document.documentElement
  const set = root.dataset.theme
  if (set === "dark" || set === "light") return set === "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export const AnimatedThemeToggler = ({ className }: AnimatedThemeTogglerProps) => {
  const { t } = useI18n()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const syncTheme = () => setDarkMode(isDark())
    syncTheme()

    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
    return () => observer.disconnect()
  }, [])

  const onToggle = useCallback(async () => {
    if (!buttonRef.current) return

    const apply = () => {
      flushSync(() => {
        const toggled = !darkMode
        setDarkMode(toggled)
        document.documentElement.classList.toggle("dark", toggled)
        document.documentElement.dataset.theme = toggled ? "dark" : "light"
        try {
          localStorage.setItem("theme", toggled ? "dark" : "light")
        } catch {}
      })
    }

    if (!document.startViewTransition) {
      apply()
      return
    }

    await document.startViewTransition(apply).ready

    const { left, top, width, height } = buttonRef.current.getBoundingClientRect()
    const centerX = left + width / 2
    const centerY = top + height / 2
    const maxDistance = Math.hypot(
      Math.max(centerX, window.innerWidth - centerX),
      Math.max(centerY, window.innerHeight - centerY)
    )

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${centerX}px ${centerY}px)`,
          `circle(${maxDistance}px at ${centerX}px ${centerY}px)`,
        ],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    )
  }, [darkMode])

  return (
    <button
      ref={buttonRef}
      onClick={onToggle}
      aria-label={t.common.switchTheme}
      className={cn(
        "flex items-center justify-center size-9 border border-[var(--color-line)] bg-transparent p-0 rounded-[var(--radius-md)] outline-none focus:outline-none active:outline-none focus:ring-0 cursor-pointer text-[var(--color-text)]",
        className
      )}
      type="button"
    >
      <AnimatePresence mode="wait" initial={false}>
        {darkMode ? (
          <motion.span
            key="sun-icon"
            initial={{ opacity: 0, scale: 0.55, rotate: 25 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.33 }}
            className="flex"
          >
            <Sun size={16} />
          </motion.span>
        ) : (
          <motion.span
            key="moon-icon"
            initial={{ opacity: 0, scale: 0.55, rotate: -25 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.33 }}
            className="flex"
          >
            <Moon size={16} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
