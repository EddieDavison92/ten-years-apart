import { lab } from "d3-color"
import { fonts } from "@/film/measure"

/**
 * A small keyed motion engine on one canvas. Scenes describe primitives by id;
 * the engine tweens every numeric property from where it is to where the next
 * scene wants it, so marks, text, lines and paths all morph between scenes.
 */

export type EaseName = "inOut" | "out" | "back" | "linear"

type Enter =
  | "fade"
  | "grow"
  | "draw"
  | "rise"
  /** Split out of another node's current position. */
  | { from: string; alpha?: number; w?: number }
  /** Start from a given state: position, size, opacity, or a number to count from. */
  | { x?: number; y?: number; w?: number; h?: number; alpha?: number; value?: number }

type Common = {
  id: string
  layer?: number
  alpha?: number
  delay?: number
  /** Delay used instead of `delay` when the node is new. */
  enterDelay?: number
  dur?: number
  /** Duration used instead of `dur` when the node is new. */
  enterDur?: number
  ease?: EaseName
  enter?: Enter
  /** How the node leaves when a later scene drops it. */
  exit?: "fade" | "shrink"
  /** Wait before leaving, ms, so a node can linger under whatever replaces it. */
  exitDelay?: number
}

export type MarkSpec = Common & {
  kind: "mark"
  x: number
  y: number
  w: number
  h?: number
  /** Corner radius; defaults to a circle or capsule. */
  rad?: number
  /** Squares off the corners on one side, so two marks join into one bar. */
  flat?: "left" | "right"
  fill: string
  stroke?: string
  strokeW?: number
  hatch?: boolean
  /** Sideways bow of the flight path as a share of its length; defaults to a small random bow. */
  arc?: number
  /** Index reported on hover. */
  hit?: number
  /** Sends out a slow ripple, to find a marked place. */
  pulse?: boolean
}

export type TextSpec = Common & {
  kind: "text"
  x: number
  y: number
  text: string
  /** When set, this number tweens and `format` renders it. */
  value?: number
  format?: (v: number) => string
  size?: number
  weight?: number
  font?: "sans" | "display"
  color?: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** Paper-coloured outline so text reads over marks. */
  halo?: boolean
  caps?: boolean
  italic?: boolean
}

export type LineSpec = Common & {
  kind: "line"
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  width?: number
  dash?: number[]
  /** Share drawn from the first end, 0–1. */
  draw?: number
}

export type PathSpec = Common & {
  kind: "path"
  /** Flat x, y pairs; NaN breaks the line. */
  pts: ArrayLike<number>
  color?: string
  width?: number
  dash?: number[]
  draw?: number
  /** Close and fill the shape in `color` instead of stroking it. */
  area?: boolean
}

export type Spec = MarkSpec | TextSpec | LineSpec | PathSpec

// State vector layouts. Colours are stored as three 0–255 channels.
const M = { x: 0, y: 1, w: 2, h: 3, rad: 4, a: 5, sw: 6, fill: 7, stroke: 10, n: 13 }
const T = { x: 0, y: 1, size: 2, a: 3, v: 4, col: 5, n: 8 }
const L = { x1: 0, y1: 1, x2: 2, y2: 3, w: 4, a: 5, d: 6, col: 7, n: 10 }
const P = { w: 0, a: 1, d: 2, col: 3, n: 6 }

const EASE: Record<EaseName, (t: number) => number> = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  linear: (t) => t,
}

// Colours tween in CIELAB, so a teal fading to purple stays clean instead of passing through grey.
const colourCache = new Map<string, [number, number, number]>()
function channels(c: string | undefined, fallback: [number, number, number] = [7.1, -0.3, -1.4]): [number, number, number] {
  if (!c) return fallback
  let v = colourCache.get(c)
  if (!v) {
    const o = lab(c)
    v = [o.l, o.a, o.b]
    colourCache.set(c, v)
  }
  return v
}

/** CIELAB (D50, as d3-color) to a CSS rgb() string. */
function css(v: Float64Array, i: number) {
  const f = (t: number) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29))
  const g = (x: number) => Math.max(0, Math.min(255, Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055))))
  const y0 = (v[i] + 16) / 116
  const x = 0.96422 * f(y0 + v[i + 1] / 500)
  const y = f(y0)
  const z = 0.82521 * f(y0 - v[i + 2] / 200)
  return `rgb(${g(3.1338561 * x - 1.6168667 * y - 0.4906146 * z)},${g(-0.9787684 * x + 1.9161415 * y + 0.033454 * z)},${g(0.0719453 * x - 0.2289914 * y + 1.4052427 * z)})`
}

/** Stable pseudo-random in [-1, 1] from an id. */
function hash(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) / 4294967295) * 2 - 1
}

type Node = {
  id: string
  spec: Spec
  seq: number
  from: Float64Array
  to: Float64Array
  cur: Float64Array
  fromPts?: Float64Array
  toPts?: Float64Array
  curPts?: Float64Array
  t0: number
  delay: number
  dur: number
  ease: (t: number) => number
  arc: number
  leaving: boolean
  done: boolean
}

const SIZE: Record<Spec["kind"], number> = { mark: M.n, text: T.n, line: L.n, path: P.n }

/** Fills a state vector from a spec; `v` must be the spec kind's size. */
function write(s: Spec, v: Float64Array): Float64Array {
  switch (s.kind) {
    case "mark": {
      const h = s.h ?? s.w
      v[M.x] = s.x
      v[M.y] = s.y
      v[M.w] = s.w
      v[M.h] = h
      v[M.rad] = s.rad ?? Math.min(s.w, h) / 2
      v[M.a] = s.alpha ?? 1
      v[M.sw] = s.stroke ? (s.strokeW ?? 1) : 0
      v.set(channels(s.fill === "none" ? s.stroke : s.fill), M.fill)
      v.set(channels(s.stroke, channels(s.fill === "none" ? undefined : s.fill)), M.stroke)
      return v
    }
    case "text":
      v[T.x] = s.x
      v[T.y] = s.y
      v[T.size] = s.size ?? 12
      v[T.a] = s.alpha ?? 1
      v[T.v] = s.value ?? 0
      v.set(channels(s.color), T.col)
      return v
    case "line":
      v[L.x1] = s.x1
      v[L.y1] = s.y1
      v[L.x2] = s.x2
      v[L.y2] = s.y2
      v[L.w] = s.width ?? 1
      v[L.a] = s.alpha ?? 1
      v[L.d] = s.draw ?? 1
      v.set(channels(s.color), L.col)
      return v
    case "path":
      v[P.w] = s.width ?? 1
      v[P.a] = s.alpha ?? 1
      v[P.d] = s.draw ?? 1
      v.set(channels(s.color), P.col)
      return v
  }
}

const state = (s: Spec) => write(s, new Float64Array(SIZE[s.kind]))

const alphaIndex = (kind: Spec["kind"]) => (kind === "mark" ? M.a : kind === "text" ? T.a : kind === "line" ? L.a : P.a)

/** Resamples a flat point list to n points by index. */
function resample(src: Float64Array, n: number): Float64Array {
  const m = src.length / 2
  const out = new Float64Array(n * 2)
  if (m === 0) return out.fill(NaN)
  for (let i = 0; i < n; i += 1) {
    const f = n === 1 ? 0 : (i / (n - 1)) * (m - 1)
    const a = Math.floor(f)
    const b = Math.min(m - 1, a + 1)
    const k = f - a
    out[i * 2] = src[a * 2] + (src[b * 2] - src[a * 2]) * k
    out[i * 2 + 1] = src[a * 2 + 1] + (src[b * 2 + 1] - src[a * 2 + 1]) * k
  }
  return out
}

export class Engine {
  private nodes = new Map<string, Node>()
  private sorted: Node[] = []
  private dirtyOrder = true
  private seq = 0
  fonts = fonts
  hatch: CanvasPattern | null = null
  paper = "#f4f4f0"
  /** Multiplies every duration; 0 under reduced motion. */
  speed = 1
  /** True while a pulsing mark is on screen, so the host keeps drawing. */
  pulsing = false
  /** Hit index of the hovered mark, ringed when drawn. */
  hover: number | null = null

  private timing(n: Node, s: Spec, now: number) {
    const safe = (v: number | undefined, d: number) => (v !== undefined && Number.isFinite(v) ? v : d)
    n.t0 = now
    n.delay = safe(s.delay, 0) * this.speed
    n.dur = Math.max(1, safe(s.dur, 1000) * this.speed)
    n.ease = EASE[s.ease ?? "inOut"]
    n.done = false
  }

  private enterState(s: Spec, to: Float64Array): Float64Array {
    const from = to.slice()
    const e = s.enter ?? (s.kind === "mark" ? "grow" : "fade")
    if (typeof e === "object" && "from" in e) {
      const src = this.nodes.get(e.from)
      if (src && s.kind === "mark" && src.spec.kind === "mark") {
        from[M.x] = src.cur[M.x]
        from[M.y] = src.cur[M.y]
        from[M.w] = e.w ?? Math.min(src.cur[M.w], to[M.w])
        from[M.h] = e.w ?? Math.min(src.cur[M.h], to[M.h])
        from[M.rad] = Math.min(from[M.w], from[M.h]) / 2
        from[M.a] = e.alpha ?? to[M.a]
        return from
      }
      from[alphaIndex(s.kind)] = 0
      if (s.kind === "mark") from[M.w] = from[M.h] = from[M.rad] = 0
      return from
    }
    if (typeof e === "object") {
      if (s.kind === "mark") {
        from[M.x] = e.x ?? to[M.x]
        from[M.y] = e.y ?? to[M.y]
        from[M.w] = e.w ?? 0
        from[M.h] = e.h ?? e.w ?? 0
        from[M.rad] = Math.min(to[M.rad], from[M.w] / 2, from[M.h] / 2)
        from[M.a] = e.alpha ?? to[M.a]
      } else if (s.kind === "text") {
        from[T.x] = e.x ?? to[T.x]
        from[T.y] = e.y ?? to[T.y]
        from[T.a] = e.alpha ?? 0
        if (e.value !== undefined) from[T.v] = e.value
      } else from[alphaIndex(s.kind)] = e.alpha ?? 0
      return from
    }
    if (e === "draw" && (s.kind === "line" || s.kind === "path")) {
      from[s.kind === "line" ? L.d : P.d] = 0
      return from
    }
    from[alphaIndex(s.kind)] = 0
    if (e === "grow" && s.kind === "mark") from[M.w] = from[M.h] = from[M.rad] = 0
    if (e === "rise" && s.kind === "text") from[T.y] += 8
    return from
  }

  private create(s: Spec, now: number) {
    const to = state(s)
    const from = this.enterState(s, to)
    const n: Node = {
      id: s.id,
      spec: s,
      seq: this.seq++,
      from,
      to,
      cur: from.slice(),
      t0: now,
      delay: 0,
      dur: 1,
      ease: EASE.inOut,
      arc: 0,
      leaving: false,
      done: false,
    }
    if (s.kind === "path") {
      n.toPts = Float64Array.from(s.pts)
      n.fromPts = n.toPts.slice()
      n.curPts = n.toPts.slice()
    }
    this.timing(n, { ...s, delay: s.enterDelay ?? s.delay, dur: s.enterDur ?? s.dur }, now)
    n.arc = s.kind === "mark" ? (s.arc ?? hash(s.id) * 0.18) : 0
    this.nodes.set(s.id, n)
    this.dirtyOrder = true
  }

  private leave(n: Node, now: number) {
    n.leaving = true
    n.from = n.cur.slice()
    n.to = n.cur.slice()
    n.to[alphaIndex(n.spec.kind)] = 0
    if (n.spec.kind === "mark" && (n.spec.exit ?? "shrink") === "shrink") {
      n.to[M.w] *= 0.2
      n.to[M.h] *= 0.2
      n.to[M.rad] *= 0.2
    }
    if (n.curPts) {
      n.fromPts = n.curPts.slice()
      n.toPts = n.curPts.slice()
    }
    n.t0 = now
    n.delay = (n.spec.exitDelay ?? 0) * this.speed
    n.dur = Math.max(1, 450 * this.speed)
    n.ease = EASE.out
    n.arc = 0
    n.done = false
  }

  /** Transition every node to a new scene. Nodes not listed leave. */
  set(specs: Spec[], now: number, instant = false) {
    const seen = new Set<string>()
    for (const s of specs) {
      seen.add(s.id)
      const n = this.nodes.get(s.id)
      if (!n) {
        this.create(s, now)
        continue
      }
      n.from = n.cur.slice()
      n.to = state(s)
      if (s.kind === "path") {
        const to = Float64Array.from(s.pts)
        n.fromPts = n.curPts && n.curPts.length === to.length ? n.curPts.slice() : resample(n.curPts ?? to, to.length / 2)
        n.toPts = to
      }
      if (n.spec.layer !== s.layer) this.dirtyOrder = true
      n.spec = s
      n.leaving = false
      if (s.kind === "mark") n.arc = s.arc ?? hash(s.id) * 0.18
      this.timing(n, s, now)
    }
    for (const n of this.nodes.values()) if (!seen.has(n.id) && !n.leaving) this.leave(n, now)
    if (instant) this.settle()
  }

  /** Move targets without restarting transitions; for scenes that change every frame. */
  update(specs: Spec[], now: number) {
    const seen = new Set<string>()
    for (const s of specs) {
      seen.add(s.id)
      const n = this.nodes.get(s.id)
      if (!n) {
        this.create(s, now)
        continue
      }
      if (n.leaving) {
        n.leaving = false
        n.from = n.cur.slice()
        n.to = state(s)
        this.timing(n, { ...s, delay: 0, dur: 400 }, now)
      } else write(s, n.to)
      // Scenes pass cached point arrays, so an unchanged reference means unchanged points.
      const newPts = s.kind === "path" && (n.spec.kind !== "path" || n.spec.pts !== s.pts)
      if (newPts) {
        const to = Float64Array.from(s.pts)
        if (!n.fromPts || n.fromPts.length !== to.length) n.fromPts = resample(n.curPts ?? to, to.length / 2)
        n.toPts = to
      }
      n.spec = s
      if (n.done) {
        n.cur.set(n.to)
        if (newPts && n.toPts) n.curPts = n.toPts.slice()
      }
    }
    for (const n of this.nodes.values()) if (!seen.has(n.id) && !n.leaving) this.leave(n, now)
  }

  /** Jump every node to its target. */
  settle() {
    for (const n of [...this.nodes.values()]) {
      if (n.leaving) {
        this.nodes.delete(n.id)
        this.dirtyOrder = true
        continue
      }
      n.cur = n.to.slice()
      if (n.toPts) n.curPts = n.toPts.slice()
      n.done = true
    }
  }

  /** Advances every node; returns true while anything is still moving. */
  step(now: number): boolean {
    let busy = false
    for (const n of this.nodes.values()) {
      if (n.done) continue
      const raw = (now - n.t0 - n.delay) / n.dur
      const k = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
      const e = n.ease(k)
      const { from, to, cur } = n
      for (let i = 0; i < cur.length; i += 1) cur[i] = from[i] + (to[i] - from[i]) * e
      if (n.arc && n.spec.kind === "mark" && k > 0 && k < 1) {
        const dx = to[M.x] - from[M.x]
        const dy = to[M.y] - from[M.y]
        const bow = n.arc * Math.sin(Math.PI * e)
        cur[M.x] -= dy * bow
        cur[M.y] += dx * bow
      }
      if (n.curPts && n.fromPts && n.toPts) {
        const f = n.fromPts
        const t = n.toPts
        if (n.curPts.length !== t.length) n.curPts = new Float64Array(t.length)
        for (let i = 0; i < t.length; i += 1) {
          const a = f[i]
          const b = t[i]
          n.curPts[i] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * e : b
        }
      }
      if (k >= 1) {
        n.done = true
        if (n.leaving) {
          this.nodes.delete(n.id)
          this.dirtyOrder = true
        }
      } else busy = true
    }
    return busy
  }

  /** Nearest hoverable mark under a point. */
  hit(x: number, y: number): { index: number; x: number; y: number; r: number } | null {
    let best: { index: number; x: number; y: number; r: number } | null = null
    let bestD = Infinity
    for (const n of this.nodes.values()) {
      const s = n.spec
      if (s.kind !== "mark" || s.hit === undefined || n.leaving || n.cur[M.a] < 0.25) continue
      const r = Math.max(n.cur[M.w], n.cur[M.h]) / 2
      const d = Math.hypot(n.cur[M.x] - x, n.cur[M.y] - y)
      if (d <= Math.max(r + 3, 7) && d < bestD) {
        bestD = d
        best = { index: s.hit, x: n.cur[M.x], y: n.cur[M.y], r }
      }
    }
    return best
  }

  /** Current position of a node, for HTML overlays. */
  position(id: string): { x: number; y: number } | null {
    const n = this.nodes.get(id)
    if (!n) return null
    if (n.spec.kind === "mark" || n.spec.kind === "text") return { x: n.cur[0], y: n.cur[1] }
    return null
  }

  /** Draws every node. Layers below 10 are clipped to `clip`, so stage marks stay clear of the caption; labels above may overhang. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number, clip?: { x: number; y: number; w: number; h: number }) {
    if (this.dirtyOrder) {
      this.sorted = [...this.nodes.values()].sort((a, b) => (a.spec.layer ?? 0) - (b.spec.layer ?? 0) || a.seq - b.seq)
      this.dirtyOrder = false
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    this.pulsing = false
    let clipped = false
    if (clip) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(clip.x, clip.y, clip.w, clip.h)
      ctx.clip()
      clipped = true
    }
    for (const n of this.sorted) {
      if (clipped && (n.spec.layer ?? 0) >= 10) {
        ctx.restore()
        clipped = false
      }
      switch (n.spec.kind) {
        case "mark":
          this.drawMark(ctx, n, n.spec)
          break
        case "text":
          this.drawText(ctx, n, n.spec)
          break
        case "line":
          this.drawLine(ctx, n, n.spec)
          break
        case "path":
          this.drawPath(ctx, n, n.spec)
          break
      }
    }
    if (clipped) ctx.restore()
    ctx.globalAlpha = 1
  }

  private drawMark(ctx: CanvasRenderingContext2D, n: Node, s: MarkSpec) {
    const c = n.cur
    const a = c[M.a]
    const w = c[M.w]
    const h = c[M.h]
    if (a < 0.003 || w < 0.05 || h < 0.05) return
    const x = c[M.x] - w / 2
    const y = c[M.y] - h / 2
    const rad = Math.max(0, Math.min(c[M.rad], w / 2, h / 2))
    ctx.beginPath()
    if (!s.flat && Math.abs(w - h) < 0.01 && rad >= w / 2 - 0.01) ctx.arc(c[M.x], c[M.y], w / 2, 0, Math.PI * 2)
    else if (rad > 0.01) ctx.roundRect(x, y, w, h, s.flat === "left" ? [0, rad, rad, 0] : s.flat === "right" ? [rad, 0, 0, rad] : rad)
    else ctx.rect(x, y, w, h)
    ctx.globalAlpha = a
    const filled = s.fill !== "none"
    if (filled) {
      ctx.fillStyle = css(c, M.fill)
      ctx.fill()
      if (s.hatch && this.hatch) {
        ctx.fillStyle = this.hatch
        ctx.fill()
      }
    }
    if (c[M.sw] > 0.02) {
      ctx.lineWidth = c[M.sw]
      ctx.strokeStyle = css(c, M.stroke)
      ctx.stroke()
    }
    if (s.hit !== undefined && s.hit === this.hover) {
      ctx.beginPath()
      ctx.arc(c[M.x], c[M.y], Math.max(w, h) / 2 + 3.5, 0, Math.PI * 2)
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.75
      ctx.strokeStyle = "#111315"
      ctx.stroke()
    }
    if (s.pulse && this.speed > 0) {
      // One ripple every 1.8 s, growing 14 px and fading out.
      const k = (performance.now() % 1800) / 1800
      ctx.beginPath()
      ctx.arc(c[M.x], c[M.y], w / 2 + 14 * (1 - (1 - k) ** 2), 0, Math.PI * 2)
      ctx.globalAlpha = a * 0.55 * (1 - k)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = css(c, M.stroke)
      ctx.stroke()
      this.pulsing = true
    }
  }

  private drawText(ctx: CanvasRenderingContext2D, n: Node, s: TextSpec) {
    const c = n.cur
    const a = c[T.a]
    if (a < 0.003) return
    const text = s.value !== undefined && s.format ? s.format(c[T.v]) : s.text
    const family = s.font === "display" ? this.fonts.display : this.fonts.sans
    ctx.font = `${s.italic ? "italic " : ""}${s.weight ?? 400} ${c[T.size]}px ${family}`
    ctx.textAlign = s.align ?? "left"
    ctx.textBaseline = s.baseline ?? "middle"
    ctx.letterSpacing = s.caps ? "0.12em" : "0px"
    const str = s.caps ? text.toUpperCase() : text
    ctx.globalAlpha = a
    if (s.halo) {
      ctx.lineWidth = 4
      ctx.lineJoin = "round"
      ctx.strokeStyle = this.paper
      ctx.strokeText(str, c[T.x], c[T.y])
    }
    ctx.fillStyle = css(c, T.col)
    ctx.fillText(str, c[T.x], c[T.y])
  }

  private drawLine(ctx: CanvasRenderingContext2D, n: Node, s: LineSpec) {
    const c = n.cur
    const a = c[L.a]
    const d = c[L.d]
    if (a < 0.003 || d < 0.001 || c[L.w] < 0.02) return
    ctx.globalAlpha = a
    ctx.lineWidth = c[L.w]
    ctx.lineCap = "round"
    ctx.strokeStyle = css(c, L.col)
    ctx.setLineDash(s.dash ?? [])
    ctx.beginPath()
    ctx.moveTo(c[L.x1], c[L.y1])
    ctx.lineTo(c[L.x1] + (c[L.x2] - c[L.x1]) * d, c[L.y1] + (c[L.y2] - c[L.y1]) * d)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawPath(ctx: CanvasRenderingContext2D, n: Node, s: PathSpec) {
    const c = n.cur
    const pts = n.curPts
    const a = c[P.a]
    if (!pts || a < 0.003 || c[P.d] < 0.001) return
    const count = pts.length / 2
    if (s.area) {
      ctx.beginPath()
      let started = false
      for (let i = 0; i < count; i += 1) {
        const x = pts[i * 2]
        const y = pts[i * 2 + 1]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (started) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        started = true
      }
      ctx.closePath()
      ctx.globalAlpha = a
      ctx.fillStyle = css(c, P.col)
      ctx.fill()
      return
    }
    const end = c[P.d] * (count - 1)
    ctx.globalAlpha = a
    ctx.lineWidth = c[P.w]
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = css(c, P.col)
    ctx.setLineDash(s.dash ?? [])
    ctx.beginPath()
    let pen = false
    for (let i = 0; i < count && i <= Math.ceil(end); i += 1) {
      let x = pts[i * 2]
      let y = pts[i * 2 + 1]
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        pen = false
        continue
      }
      if (i > end && i > 0) {
        const px = pts[i * 2 - 2]
        const py = pts[i * 2 - 1]
        if (!Number.isFinite(px) || !Number.isFinite(py)) break
        const k = end - (i - 1)
        x = px + (x - px) * k
        y = py + (y - py) * k
      }
      if (pen) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
      pen = true
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
}
