"use client"

import { useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"
import { useAppI18n } from "@/components/i18n/app-provider"

interface PrismFluxLoaderProps {
  size?: number // cube size in px
  speed?: number // rotation speed
}

export function PrismFluxLoader({ size = 30, speed = 5 }: PrismFluxLoaderProps) {
  const statuses = useAppI18n().t.setup.loader
  const [time, setTime] = useState(0)
  const [statusIndex, setStatusIndex] = useState(0)

  // Cube rotation
  useEffect(() => {
    const id = setInterval(() => setTime((t) => t + 0.02 * speed), 16)
    return () => clearInterval(id)
  }, [speed])

  // Status text changes every 600ms
  useEffect(() => {
    const id = setInterval(() => setStatusIndex((i) => (i + 1) % statuses.length), 600)
    return () => clearInterval(id)
  }, [statuses.length])

  const half = size / 2
  const faces = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ]

  return (
    <div role="status" className="flex h-[220px] flex-col items-center justify-center gap-4">
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          transform: `rotateY(${time * 30}deg) rotateX(${time * 30}deg)`,
        }}
      >
        {faces.map((transform, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center text-[var(--color-text)]"
            style={{
              width: size,
              height: size,
              border: "1px solid var(--color-text)",
              transform,
              backfaceVisibility: "hidden",
            }}
          >
            <PlusIcon />
          </div>
        ))}
      </div>

      <div className="text-sm font-semibold tracking-wide text-[var(--color-text)]">
        {statuses[statusIndex]}...
      </div>
    </div>
  )
}
