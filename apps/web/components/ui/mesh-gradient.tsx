"use client"

// A named, static import so the bundler keeps only this shader: a dynamic import() of the
// package itself would bring in all of them (~270 KB).
export { MeshGradient } from "@paper-design/shaders-react"
