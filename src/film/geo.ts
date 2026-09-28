/** Geometry shared by scenes: hex map, beeswarm packing, memo cache. */

export type Box = { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number }

const memo = new Map<string, unknown>()
/** Caches a layout by key; layouts depend only on data, sex and box size. */
export function cached<T>(key: string, make: () => T): T {
  if (!memo.has(key)) {
    if (memo.size > 400) memo.clear()
    memo.set(key, make())
  }
  return memo.get(key) as T
}

/** Odd-r hex grid fitted into a box, north up. */
export function hexLayout(cells: { q: number; r: number }[], box: Box) {
  const qs = cells.map((c) => c.q + (c.r & 1 ? 0.5 : 0))
  const rs = cells.map((c) => c.r)
  const qMin = Math.min(...qs)
  const qMax = Math.max(...qs)
  const rMin = Math.min(...rs)
  const rMax = Math.max(...rs)
  const rowH = Math.sqrt(3) / 2
  const unit = Math.min(box.w / (qMax - qMin + 1), box.h / ((rMax - rMin) * rowH + 1))
  const w = (qMax - qMin + 1) * unit
  const h = ((rMax - rMin) * rowH + 1) * unit
  const ox = box.x + (box.w - w) / 2 + unit / 2
  const oy = box.y + (box.h - h) / 2 + unit / 2
  return {
    unit,
    points: cells.map((c, i) => ({ x: ox + (qs[i] - qMin) * unit, y: oy + (rMax - c.r) * rowH * unit })),
  }
}

/**
 * Packs circles along x without overlap, alternating either side of a centre
 * line, placed in x order so the swarm reads left to right.
 */
export function dodge(xs: (number | null)[], radius: number, centre: number, maxSpread = Infinity): (Pt | null)[] {
  const out: (Pt | null)[] = xs.map(() => null)
  const order = xs
    .map((x, i) => ({ x, i }))
    .filter((d): d is { x: number; i: number } => d.x !== null && Number.isFinite(d.x))
    .sort((a, b) => a.x - b.x)
  const placed: Pt[] = []
  const d2 = (radius * 2) ** 2
  let lo = 0
  for (const { x, i } of order) {
    while (lo < placed.length && placed[lo].x < x - radius * 2) lo += 1
    let best = 0
    for (let k = 0; k < 600; k += 1) {
      const offset = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * radius * 0.5
      if (Math.abs(offset) > maxSpread) continue
      let clear = true
      for (let j = lo; j < placed.length; j += 1) {
        const p = placed[j]
        if ((p.x - x) ** 2 + (p.y - offset) ** 2 < d2 * 0.98) {
          clear = false
          break
        }
      }
      if (clear) {
        best = offset
        break
      }
    }
    placed.push({ x, y: best })
    out[i] = { x, y: centre + best }
  }
  return out
}

/** Value of a series at a fractional index, bridging gaps. */
export function at(series: (number | null)[], t: number): number | null {
  const i = Math.max(0, Math.min(series.length - 1, Math.floor(t)))
  const a = series[i]
  const b = series[Math.min(series.length - 1, i + 1)]
  const k = t - i
  if (a === null || a === undefined) return b ?? null
  if (b === null || b === undefined || k <= 0) return a
  return a + (b - a) * k
}
