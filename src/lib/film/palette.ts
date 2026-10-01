import { interpolateRgbBasis } from "d3-interpolate"

export const INK = "#111315"
export const INK_2 = "#3f4349"
export const INK_3 = "#62666d"
export const INK_4 = "#9a9ea4"
export const LINE = "#d9d8d2"
export const PAPER = "#f4f4f0"
/** Years in good health: slate blue, apart from the brick–teal gap scale. */
export const HEALTHY = "#3b6a8c"
/** The place the reader follows, in every scene. */
export const FOLLOW = "#2256d1"
/** Years not in good health: a pale tint of HEALTHY, so the bar reads as one lifespan. */
export const POOR = "#cfd8dc"
export const NO_DATA = "#cfcdc6"

/** Worse ↔ better for every gap and change: brick (shorter, falling) through warm grey to teal (longer, rising). */
export const DIVERGING = ["#7a1f14", "#b3452c", "#dc8466", "#efc2ad", "#e6e4de", "#b3dbdf", "#64b0b8", "#1e8590", "#075862"]
export const diverging = interpolateRgbBasis(DIVERGING)
export const BRICK = DIVERGING[1]
export const TEAL = DIVERGING[8]

/** Deprivation tenth, 1 (most deprived) dark aubergine to 10 lilac. */
const decileRamp = interpolateRgbBasis(["#3b1650", "#673a7e", "#8f68a6", "#ab8fc4"])
export const decileColour = (d: number) => decileRamp((d - 1) / 9)

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
