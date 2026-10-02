/** Geometry for the dot stage: hex map positions and beeswarm packing. */

export type Point = { x: number; y: number }

/** Odd-r hex grid (rows offset on odd r) fitted into a box, north up. `top` pins it below that offset instead of centring. */
export function hexPositions(
  cells: { q: number; r: number }[],
  width: number,
  height: number,
  pad = 12,
  top?: number
): { points: Point[]; radius: number } {
  const qs = cells.map((c) => c.q + (c.r & 1 ? 0.5 : 0))
  const rs = cells.map((c) => c.r)
  const qMin = Math.min(...qs)
  const qMax = Math.max(...qs)
  const rMin = Math.min(...rs)
  const rMax = Math.max(...rs)
  const rowH = Math.sqrt(3) / 2
  const unit = Math.min(
    (width - pad * 2) / (qMax - qMin + 1),
    (height - pad * 2) / ((rMax - rMin) * rowH + 1)
  )
  const w = (qMax - qMin + 1) * unit
  const h = ((rMax - rMin) * rowH + 1) * unit
  const ox = (width - w) / 2 + unit / 2
  const oy = (top !== undefined && top + h <= height ? top : (height - h) / 2) + unit / 2
  return {
    radius: unit * 0.46,
    points: cells.map((c, i) => ({
      x: ox + (qs[i] - qMin) * unit,
      y: oy + (rMax - c.r) * rowH * unit,
    })),
  }
}

/**
 * Packs circles along x without overlap, alternating above and below a centre
 * line. Order of placement follows x so the swarm reads left to right.
 */
export function dodge(xs: (number | null)[], radius: number, centre: number, maxSpread = Infinity, info?: { crowded: number }): (Point | null)[] {
  const out: (Point | null)[] = xs.map(() => null)
  const order = xs
    .map((x, i) => ({ x, i }))
    .filter((d): d is { x: number; i: number } => d.x !== null && Number.isFinite(d.x))
    .sort((a, b) => a.x - b.x)
  const placed: { x: number; y: number }[] = []
  const d2 = (radius * 2) ** 2
  for (const { x, i } of order) {
    const near = placed.filter((p) => Math.abs(p.x - x) < radius * 2)
    let best: number | null = null
    // If no slot is clear, the one farthest from its neighbours, so dots never stack exactly.
    let roomiest = 0
    let room = -1
    for (let k = 0; k < 400; k += 1) {
      const offset = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * radius * 0.5
      if (Math.abs(offset) > maxSpread) continue
      const gap = Math.min(Infinity, ...near.map((p) => (p.x - x) ** 2 + (p.y - offset) ** 2))
      if (gap >= d2 * 0.98) {
        best = offset
        break
      }
      if (gap > room) {
        room = gap
        roomiest = offset
      }
    }
    if (best === null) {
      best = roomiest
      if (info) info.crowded += 1
    }
    placed.push({ x, y: best })
    out[i] = { x, y: centre + best }
  }
  return out
}
