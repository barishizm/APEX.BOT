// shadcn/ui progress (https://ui.shadcn.com/docs/components/progress), adapted to this app: a plain
// element instead of Radix, colored from our CSS variables. `value` is 0–100; `tone` marks a
// warning or a limit reached, the only places the monochrome dashboard uses color.

import * as React from "react"
import { cn } from "@/lib/utils"

const TONES = { default: "bg-[var(--color-text)]", warning: "bg-amber-500", danger: "bg-red-600 dark:bg-red-500" } as const

function Progress({
  className,
  value = 0,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & { value?: number; tone?: keyof typeof TONES }) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-bubble)]", className)}
      {...props}
    >
      <div data-slot="progress-indicator" className={cn("h-full transition-[width] duration-500", TONES[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export { Progress }
