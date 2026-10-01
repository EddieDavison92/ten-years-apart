import { interpolateRgbBasis } from "d3"

/** Colour roles shared by every chart on the site. */
export const INK = "#111315"
export const INK_2 = "#3f4349"
export const INK_3 = "#62666d"
export const LINE = "#d9d8d2"
export const LINE_2 = "#e7e6e1"
export const PAPER = "#f4f4f0"
export const BRAND = "#0b6e62"
export const MALE = "#2f6db5"
export const FEMALE = "#c27812"
export const HEALTHY = "#1a7a6b"
export const POOR = "#cbc3b2"
export const NO_DATA = "#dddcd5"
/** Years not in good health: hatched warm grey, so it reads as time still lived but dimmed. */
export const POOR_FILL = "repeating-linear-gradient(135deg, rgba(17,19,21,0.09) 0 1.5px, transparent 1.5px 6px), #d8d2c4"

/**
 * Worse ↔ better, used for every gap and change on the site:
 * brick (shorter, falling) through a warm grey to teal (longer, rising).
 */
export const DIVERGING = ["#7a1f14", "#b3452c", "#dc8466", "#efc2ad", "#e6e4de", "#b9ddd2", "#6fb6a1", "#2a8a76", "#0b5a4c"]
export const divergingColour = interpolateRgbBasis(DIVERGING)
export const CHANGE_RAMP = DIVERGING
export const changeColour = divergingColour

/** Life expectancy level: one hue, pale (shorter) to deep teal (longer). */
export const LE_RAMP = ["#eaf0ea", "#c8dfd4", "#99c7b5", "#66aa94", "#3f8d77", "#236f5e", "#12544a", "#083a33"]
export const leColour = interpolateRgbBasis(LE_RAMP)

/** Deprivation tenth, 1 (most deprived) dark aubergine to 10 lilac. */
const DECILE_RAMP = ["#3b1650", "#673a7e", "#8f68a6", "#ab8fc4"]
const decileInterp = interpolateRgbBasis(DECILE_RAMP)
export function decileColour(decile: number): string {
  return decileInterp((decile - 1) / 9)
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t))
}
