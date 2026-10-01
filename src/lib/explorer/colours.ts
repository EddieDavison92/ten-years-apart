/** Map ramps, shared with the story palette. */

/** Life expectancy: pale (shorter) to deep teal (longer). */
export const TEAL_RAMP = ["#eaf0ea", "#c8dfd4", "#99c7b5", "#66aa94", "#3f8d77", "#236f5e", "#12544a", "#083a33"] as const

/** Death rates: pale sand (fewer) to brick (more). */
export const AVOIDABLE_RAMP = ["#f7efe1", "#efd9b8", "#e5bb8e", "#d6966a", "#c0714c", "#9e5035", "#763723"] as const

/** Change and gaps: brick (lower) through warm grey to teal (higher). */
export const DIVERGING_RAMP = ["#7a1f14", "#b3452c", "#dc8466", "#efc2ad", "#e6e4de", "#b9ddd2", "#6fb6a1", "#2a8a76", "#0b5a4c"] as const

export const DIVERGING_RAMP_REVERSED = [...DIVERGING_RAMP].reverse()

export const NO_DATA = "#dddcd5"

export function interpolateRamp(
  ramp: readonly string[],
  t: number
): string {
  const x = Math.max(0, Math.min(1, t))
  const scaled = x * (ramp.length - 1)
  const i = Math.floor(scaled)
  const f = scaled - i
  if (i >= ramp.length - 1) return ramp[ramp.length - 1]
  return mixColour(ramp[i], ramp[i + 1], f)
}

export type Rgb = [number, number, number]

export function toRgb(hex: string): Rgb {
  return parseColour(hex)
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function rgbToHex(rgb: Rgb): string {
  return `#${toHex(Math.round(rgb[0]))}${toHex(Math.round(rgb[1]))}${toHex(Math.round(rgb[2]))}`
}

export function mixColour(a: string, b: string, t: number): string {
  return rgbToHex(mixRgb(toRgb(a), toRgb(b), t))
}

export function rgbLookup(colours: Record<string, string>): Record<string, Rgb> {
  const out: Record<string, Rgb> = {}
  for (const key of Object.keys(colours)) out[key] = toRgb(colours[key] ?? NO_DATA)
  return out
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0")
}

function parseColour(hex: string): [number, number, number] {
  const rgb = hex.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const h = hex.replace("#", "")
  if (h.length < 6) return [226, 232, 240]
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export function motionMs(ms: number): number {
  if (typeof window === "undefined") return ms
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms
}

export function linearT(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max === min) return 0.5
  return (value - min) / (max - min)
}
