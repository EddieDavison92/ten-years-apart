/** Font families resolved from the page's CSS variables once fonts load; shared by the engine and label layout. */
export const fonts = { sans: "system-ui, sans-serif", display: "Georgia, serif" }

let canvas: HTMLCanvasElement | null = null

export function textWidth(text: string, size: number, weight = 400, font: "sans" | "display" = "sans") {
  if (typeof document === "undefined") return text.length * size * 0.56
  canvas ??= document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return text.length * size * 0.56
  ctx.font = `${weight} ${size}px ${fonts[font]}`
  return ctx.measureText(text).width
}
