import { scaleLinear } from "d3-scale"
import type { LineSpec, MarkSpec, PathSpec, Spec, TextSpec } from "@/film/engine"
import { at, cached, dodge, hexLayout, type Box, type Pt } from "@/film/geo"
import { textWidth } from "@/film/measure"
import type { Area, FilmData, Sex } from "@/lib/compute"
import { months, signed, years } from "@/lib/format"
import {
  BRICK,
  clamp01,
  decileColour,
  DIVERGING,
  diverging,
  HEALTHY,
  INK,
  INK_2,
  INK_3,
  INK_4,
  LINE,
  NO_DATA,
  PAPER,
  POOR,
  TEAL,
} from "@/lib/palette"

export type Ctx = {
  data: FilmData
  sex: Sex
  /** Canvas size in CSS pixels. */
  W: number
  H: number
  /** Plot area, clear of the caption and controls. */
  box: Box
  narrow: boolean
  /** Period index, fractional while time plays. */
  t: number
  follow: string | null
  /** Index into data.factors for the circumstances scenes. */
  factor: number
}

export type SceneDef = {
  id: string
  chapter: number
  /** Plays the period index from `from` to `to` over `ms`, after `delay`. */
  time?: { from: number; to: number; ms: number; delay?: number }
  /** Shows the factor switcher. */
  factors?: boolean
  build: (c: Ctx) => Spec[]
  aria: (c: Ctx) => string
}

// Colours saturate at ±4.5 years for the gap to the UK and ±1.5 years for change since 2011–13.
export const GAP_SPAN = 4.5
export const CHANGE_SPAN = 1.5
const WHITE = "#ffffff"
const LAST = 21
/** Deaths per 100,000 that one dot stands for. */
export const UNIT = 5

const gapColour = (v: number | null, uk: number) => (v === null ? NO_DATA : diverging(clamp01((v - uk + GAP_SPAN) / (2 * GAP_SPAN))))
const changeColour = (d: number | null) => (d === null ? NO_DATA : diverging(clamp01((d + CHANGE_SPAN) / (2 * CHANGE_SPAN))))
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const bk = (b: Box) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`
const who = (s: Sex) => (s === "male" ? "Men" : "Women")

const txt = (id: string, x: number, y: number, text: string, o: Partial<TextSpec> = {}): TextSpec => ({
  kind: "text",
  id,
  x,
  y,
  text,
  size: 11,
  color: INK_3,
  layer: 8,
  dur: 900,
  ...o,
})
const line = (id: string, x1: number, y1: number, x2: number, y2: number, o: Partial<LineSpec> = {}): LineSpec => ({
  kind: "line",
  id,
  x1,
  y1,
  x2,
  y2,
  color: INK,
  width: 1,
  layer: 1,
  dur: 900,
  ...o,
})
const mark = (id: string, x: number, y: number, w: number, fill: string, o: Partial<MarkSpec> = {}): MarkSpec => ({
  kind: "mark",
  id,
  x,
  y,
  w,
  fill,
  layer: 3,
  ...o,
})
const path = (id: string, pts: ArrayLike<number>, o: Partial<PathSpec> = {}): PathSpec => ({
  kind: "path",
  id,
  pts,
  color: INK,
  width: 1,
  layer: 2,
  dur: 900,
  ...o,
})

const now = (c: Ctx) => c.data.index.now
const value = (a: Area, c: Ctx, i = now(c)) => a[c.sex][i]
const change = (a: Area, c: Ctx) => {
  const v = a[c.sex][now(c)]
  const b = a[c.sex][c.data.index.stall]
  return v === null || b === null ? null : v - b
}
const ukNow = (c: Ctx) => c.data.uk[c.sex][now(c)]
/** The lowest and highest places for the selected sex. */
const pairOf = (c: Ctx) => c.data.pairs[c.sex]
const pairCodes = (c: Ctx) => ({ low: pairOf(c).low.code, high: pairOf(c).high.code })
const areaIndex = (c: Ctx, code: string) => c.data.areas.findIndex((a) => a.code === code)
/** "Kensington and Chelsea" -> "Kensington" on phones, where labels sit beside a narrow chart. */
const short = (name: string, narrow: boolean) => (narrow ? name.split(/ and | City| upon /)[0] : name)

/** Life expectancy axis at the latest period, padded a year each side. */
function leDomain(c: Ctx): [number, number] {
  return cached(`led:${c.sex}`, () => {
    const v = c.data.areas.map((a) => value(a, c)).filter((x): x is number => x !== null)
    return [Math.floor(Math.min(...v)) - 1, Math.ceil(Math.max(...v)) + 1]
  })
}

/** Label in a white pill with a leader to its anchor. Name in ink, figure in grey. */
function pill(
  key: string,
  anchor: Pt,
  r: number,
  name: string,
  figure: string,
  c: Ctx,
  o: { side?: "above" | "below" | "left" | "right"; lift?: number; delay?: number; alpha?: number; tone?: string } = {}
): Spec[] {
  const size = c.narrow ? 11.5 : 12.5
  const w1 = textWidth(name, size, 600)
  const w2 = figure ? textWidth(figure, size, 400) : 0
  const gap = figure ? 6 : 0
  const w = w1 + gap + w2 + 22
  const h = c.narrow ? 23 : 26
  const side = o.side ?? "above"
  const lift = o.lift ?? 26
  let cx = anchor.x
  let cy = anchor.y
  if (side === "above") cy = anchor.y - r - lift - h / 2
  if (side === "below") cy = anchor.y + r + lift + h / 2
  if (side === "left") cx = anchor.x - r - lift - w / 2
  if (side === "right") cx = anchor.x + r + lift + w / 2
  cx = clamp(cx, w / 2 + 8, c.W - w / 2 - 8)
  const a = o.alpha ?? 1
  const delay = o.delay ?? 0
  const left = cx - w / 2 + 11
  const lead =
    side === "above"
      ? [anchor.x, anchor.y - r - 2, anchor.x, cy + h / 2]
      : side === "below"
        ? [anchor.x, anchor.y + r + 2, anchor.x, cy - h / 2]
        : side === "left"
          ? [anchor.x - r - 2, anchor.y, cx + w / 2, cy]
          : [anchor.x + r + 2, anchor.y, cx - w / 2, cy]
  return [
    line(`${key}:lead`, lead[0], lead[1], lead[2], lead[3], { color: o.tone ?? INK, alpha: a * 0.8, layer: 9, delay }),
    mark(`${key}:bg`, cx, cy, w, WHITE, { h, rad: h / 2, stroke: "#d6d5cf", strokeW: 1, layer: 10, arc: 0, enter: "fade", alpha: a, delay }),
    txt(`${key}:name`, left, cy + 0.5, name, { size, weight: 600, color: o.tone ?? INK, layer: 11, alpha: a, delay }),
    txt(`${key}:fig`, left + w1 + gap, cy + 0.5, figure, { size, color: INK_3, layer: 11, alpha: figure ? a : 0, delay }),
  ]
}

/** Ring and label for the place the reader follows. */
function followSpecs(c: Ctx, p: Pt | null, r: number, figure: string, side: "above" | "below" | "left" | "right" = "above"): Spec[] {
  if (!c.follow || !p) return []
  const a = c.data.areas.find((x) => x.code === c.follow)
  if (!a) return []
  return [
    mark("follow:ring", p.x, p.y, r * 2 + 9, "none", { stroke: INK, strokeW: 1.75, layer: 9, arc: 0 }),
    ...pill("follow", p, r + 4, a.name, figure, c, { side, lift: 18 }),
  ]
}

/** Colour ramp legend for gap or change. */
function legend(c: Ctx, kind: "gap" | "change", x: number, y: number): Spec[] {
  const w = c.narrow ? 140 : 180
  const sw = w / DIVERGING.length
  const span = kind === "gap" ? GAP_SPAN : CHANGE_SPAN
  const title = kind === "gap" ? `Gap to UK average, ${years(ukNow(c))}` : "Change since 2011–13"
  return [
    txt(`leg:title:${title}`, x, y, title, { size: 10, caps: true, weight: 600, color: INK_3 }),
    ...DIVERGING.map((col, i) => mark(`leg:${i}`, x + sw * (i + 0.5), y + 17, sw - 1.5, col, { h: 7, rad: 1.5, layer: 8, arc: 0, delay: i * 30 })),
    txt(`leg:lo:${kind}`, x, y + 32, `${kind === "gap" ? "Shorter" : "Fell"} −${span}`, { size: 10.5, color: INK_2 }),
    txt(`leg:hi:${kind}`, x + w, y + 32, `+${span} ${kind === "gap" ? "Longer" : "Rose"}`, { size: 10.5, color: INK_2, align: "right" }),
  ]
}

/**
 * Horizontal axis ticks. Ghosts are another axis's ticks placed on this scale at zero opacity,
 * so switching axes slides both sets like a zoom.
 */
function xTicks(
  key: string,
  x: (v: number) => number,
  ticks: number[],
  y: number,
  o: { fmt?: (v: number) => string; ghosts?: { key: string; ticks: number[] }; grid?: [number, number] } = {}
): Spec[] {
  const out: Spec[] = []
  const fmt = o.fmt ?? String
  for (const t of ticks) {
    out.push(txt(`${key}:${t}`, x(t), y, fmt(t), { align: "center", size: 11 }))
    if (o.grid) out.push(line(`${key}:g:${t}`, x(t), o.grid[0], x(t), o.grid[1], { color: LINE, layer: 0 }))
  }
  if (o.ghosts) for (const t of o.ghosts.ticks) out.push(txt(`${o.ghosts.key}:${t}`, x(t), y, fmt(t), { align: "center", alpha: 0 }))
  return out
}

// ——— I. The gap ———————————————————————————————————————————————

function open(c: Ctx): Spec[] {
  const { box, data, sex } = c
  const { low, high } = pairCodes(c)
  const hi = data.areas[areaIndex(c, high)]
  const lo = data.areas[areaIndex(c, low)]
  const hv = value(hi, c) as number
  const lv = value(lo, c) as number
  const x = scaleLinear().domain([0, 90]).range([box.x + 6, box.x + box.w - (c.narrow ? 44 : 70)])
  const mid = box.y + box.h * 0.46
  const gap = c.narrow ? 70 : 92
  const DRAW = 2400
  const rows = [
    { a: hi, v: hv, y: mid - gap / 2, colour: TEAL, delay: 250 },
    { a: lo, v: lv, y: mid + gap / 2, colour: BRICK, delay: 650 },
  ]
  const specs: Spec[] = []
  for (const r of rows) {
    const i = areaIndex(c, r.a.code)
    specs.push(
      line(`life:${r.a.code}`, x(0), r.y, x(r.v), r.y, { color: r.colour, width: c.narrow ? 3 : 4, enter: "draw", dur: DRAW, delay: r.delay, layer: 2 }),
      mark(`born:${r.a.code}`, x(0), r.y, c.narrow ? 7 : 9, r.colour, { enterDelay: r.delay, dur: 500, layer: 3 }),
      mark(`a:${r.a.code}`, x(r.v), r.y, c.narrow ? 14 : 18, r.colour, {
        hit: i,
        enter: { x: x(0), w: c.narrow ? 14 : 18, alpha: 1 },
        enterDelay: r.delay,
        dur: DRAW,
        arc: 0,
        stroke: PAPER,
        strokeW: 2.5,
        layer: 4,
      }),
      txt(`name:${r.a.code}`, x(0), r.y - (c.narrow ? 18 : 22), r.a.name, { size: c.narrow ? 13 : 15, weight: 600, color: INK, delay: r.delay, enter: "rise" }),
      txt(`val:${r.a.code}`, x(r.v) + (c.narrow ? 13 : 17), r.y + 1, "", {
        value: r.v,
        format: (v) => years(v),
        size: c.narrow ? 20 : 27,
        font: "display",
        color: INK,
        enter: { x: x(0) + (c.narrow ? 13 : 17), value: 0, alpha: 1 },
        enterDelay: r.delay,
        dur: DRAW,
      })
    )
  }
  // The last ten years of the longer line: the gap itself.
  const top = rows[0].y - (c.narrow ? 36 : 46)
  const bottom = rows[1].y + (c.narrow ? 20 : 26)
  const cx = (x(lv) + x(hv)) / 2
  const after = DRAW + 800
  specs.push(
    mark("gap:band", cx, (top + bottom) / 2, x(hv) - x(lv), INK, { h: bottom - top, rad: 6, alpha: 0.06, layer: 0, enter: "fade", enterDelay: after, dur: 900, arc: 0 }),
    line("gap:guide", x(lv), rows[0].y - 10, x(lv), rows[1].y - 12, { dash: [2, 4], alpha: 0.55, enter: "draw", delay: after, dur: 700 }),
    line("gap:br", x(lv), bottom + 12, x(hv), bottom + 12, { width: 1.25, enter: "draw", delay: after + 200, dur: 800 }),
    line("gap:brL", x(lv), bottom + 6, x(lv), bottom + 18, { width: 1.25, delay: after + 200 }),
    line("gap:brR", x(hv), bottom + 6, x(hv), bottom + 18, { width: 1.25, delay: after + 200 }),
    txt("gap:label", cx, bottom + 38, "", {
      value: hv - lv,
      format: (v) => `${years(v)} years`,
      size: c.narrow ? 20 : 26,
      font: "display",
      color: INK,
      align: "center",
      enter: { value: 0 },
      delay: after + 400,
      dur: 1100,
    })
  )
  // Age axis.
  const axisY = bottom + (c.narrow ? 76 : 92)
  specs.push(line("age:base", x(0), axisY - 14, x(90), axisY - 14, { color: LINE, layer: 0 }))
  const leTicks = scaleLinear().domain(leDomain(c)).ticks(c.narrow ? 5 : 8)
  specs.push(...xTicks("age", x, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], axisY, { ghosts: { key: "x", ticks: leTicks } }))
  specs.push(txt("age:title", x(90), axisY + 20, "Age, years", { align: "right", size: 10.5 }))
  specs.push(txt(`title:open:${sex}`, x(0), top - 26, `${who(sex)} · life expectancy at birth · ${data.periods[now(c)]}`, { size: 10, caps: true, weight: 600 }))
  return specs
}

/** Every place on one life expectancy axis, packed as a beeswarm. */
function swarmPositions(c: Ctx, x: (v: number) => number, r: number, cy: number) {
  return cached(`swarm:${c.sex}:${bk(c.box)}:${r}`, () =>
    dodge(
      c.data.areas.map((a) => (value(a, c) === null ? null : x(value(a, c) as number))),
      r,
      cy,
      c.box.h * 0.34
    )
  )
}

function swarm(c: Ctx): Spec[] {
  const { box, data, sex } = c
  const dom = leDomain(c)
  const x = scaleLinear().domain(dom).range([box.x + 8, box.x + box.w - 8])
  const r = clamp(Math.min(box.w / 118, box.h / 64), 2.4, 7)
  const cy = box.y + box.h * 0.52
  const pos = swarmPositions(c, x, r, cy)
  const uk = ukNow(c)
  const ranks = cached(`rank:${sex}`, () => {
    const order = data.areas.map((a, i) => ({ i, v: value(a, c) ?? Infinity })).sort((a, b) => a.v - b.v)
    const out = new Array<number>(order.length)
    order.forEach((o, k) => (out[o.i] = k))
    return out
  })
  const { low, high } = pairCodes(c)
  const specs: Spec[] = []
  let topY = Infinity
  let bottomY = -Infinity
  data.areas.forEach((a, i) => {
    const p = pos[i]
    if (!p) return
    topY = Math.min(topY, p.y)
    bottomY = Math.max(bottomY, p.y)
    const special = a.code === low || a.code === high
    specs.push(
      mark(`a:${a.code}`, p.x, p.y, special ? r * 2 + 2 : r * 2, gapColour(value(a, c), uk), {
        hit: i,
        stroke: special ? INK : undefined,
        strokeW: special ? 1.25 : 0,
        delay: ((p.x - box.x) / box.w) * 300,
        enterDelay: 700 + ranks[i] * 4.5,
        dur: 1100,
        ease: "inOut",
        layer: special ? 5 : 3,
      })
    )
  })
  const lp = pos[areaIndex(c, low)] as Pt
  const hp = pos[areaIndex(c, high)] as Pt
  const brY = topY - r - (c.narrow ? 40 : 52)
  specs.push(
    line("uk:rule", x(uk), topY - r - 14, x(uk), bottomY + r + 10, { dash: [2, 3], alpha: 0.8, layer: 6 }),
    txt("uk:lab", x(uk), topY - r - 24, `UK ${years(uk)}`, { align: "center", size: 11.5, weight: 600, color: INK, halo: true }),
    line("gap:br", lp.x, brY, hp.x, brY, { width: 1.25 }),
    line("gap:brL", lp.x, brY - 6, lp.x, brY + 6, { width: 1.25 }),
    line("gap:brR", hp.x, brY - 6, hp.x, brY + 6, { width: 1.25 }),
    txt("gap:label", (lp.x + hp.x) / 2, brY - 22, "", {
      value: (value(data.areas[areaIndex(c, high)], c) as number) - (value(data.areas[areaIndex(c, low)], c) as number),
      format: (v) => `${years(v)} years`,
      size: c.narrow ? 18 : 22,
      font: "display",
      color: INK,
      align: "center",
    })
  )
  specs.push(...pill(`lab:${low}`, lp, r + 1, pairOf(c).low.name, years(value(data.areas[areaIndex(c, low)], c)), c, { side: "below", lift: bottomY - lp.y + 18, tone: BRICK }))
  specs.push(...pill(`lab:${high}`, hp, r + 1, pairOf(c).high.name, years(value(data.areas[areaIndex(c, high)], c)), c, { side: "below", lift: bottomY - hp.y + 18, tone: TEAL }))
  const axisY = box.y + box.h - 6
  const ticks = x.ticks(c.narrow ? 5 : 8).filter((t) => t >= dom[0] && t <= dom[1])
  specs.push(line("age:base", x(dom[0]), axisY - 14, x(dom[1]), axisY - 14, { color: LINE, layer: 0 }))
  specs.push(...xTicks("x", x, ticks, axisY, { ghosts: { key: "age", ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] } }))
  specs.push(txt(`xt:le:${sex}`, x(dom[1]), axisY + 20, `${who(sex)}, life expectancy at birth, ${data.periods[now(c)]} →`, { align: "right", size: 10.5 }))
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high) specs.push(...followSpecs(c, pos[fi], r, years(value(data.areas[fi], c)), "above"))
  return specs
}

function mapPositions(c: Ctx) {
  const inset = c.narrow ? 4 : 12
  const box = { x: c.box.x + inset, y: c.box.y + inset, w: c.box.w - inset * 2, h: c.box.h - inset * 2 }
  return cached(`hex:${bk(box)}`, () => hexLayout(c.data.areas, box))
}

function map(c: Ctx, mode: "gap" | "ends" | "change"): Spec[] {
  const { box, data } = c
  const hex = mapPositions(c)
  const w = hex.unit * 0.9
  const uk = ukNow(c)
  const { low, high } = pairCodes(c)
  const ext = data.extremes[c.sex]
  const ringed = new Set(mode === "ends" ? [...ext.topTen, ...ext.bottomTen] : [])
  const specs: Spec[] = []
  data.areas.forEach((a, i) => {
    const p = hex.points[i]
    const fill = mode === "change" ? changeColour(change(a, c)) : gapColour(value(a, c), uk)
    const dim = mode === "ends" && !ringed.has(a.code)
    specs.push(
      mark(`a:${a.code}`, p.x, p.y, w, fill, {
        hit: i,
        alpha: dim ? 0.28 : 1,
        delay: ((p.y - box.y) / box.h) * 380,
        enterDelay: 300 + ((box.y + box.h - p.y) / box.h) * 1500 + Math.abs(p.x - (box.x + box.w / 2)) * 0.6,
        dur: 1200,
        layer: ringed.has(a.code) ? 4 : 3,
      })
    )
    if (ringed.has(a.code)) {
      const top = ext.topTen.includes(a.code)
      specs.push(mark(`ring:${a.code}`, p.x, p.y, w + 7, "none", { stroke: top ? TEAL : BRICK, strokeW: 1.75, layer: 5, delay: 300 + i * 2, arc: 0 }))
    }
  })
  // Nation labels beside each cluster.
  const nations = [
    { key: "S", name: "Scotland", side: -1 },
    { key: "N", name: "Northern Ireland", side: -1 },
    { key: "W", name: "Wales", side: -1 },
    { key: "E", name: "England", side: 1 },
  ]
  for (const n of nations) {
    const pts = hex.points.filter((_, i) => data.areas[i].nation === n.key)
    if (!pts.length) continue
    const ys = pts.map((p) => p.y)
    const xs = pts.map((p) => p.x)
    const midY = n.key === "E" ? Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.3 : (Math.min(...ys) + Math.max(...ys)) / 2
    const label = c.narrow && n.key === "N" ? "N. Ireland" : n.name
    const tw = textWidth(label.toUpperCase(), 10, 600) * 1.12
    const edge = n.side < 0 ? Math.max(tw + 6, Math.min(...xs) - w) : Math.min(c.W - tw - 6, Math.max(...xs) + w)
    specs.push(txt(`nation:${n.key}`, edge, midY, label, { align: n.side < 0 ? "right" : "left", size: 10, caps: true, weight: 600, color: INK_4, delay: 600, halo: true }))
  }
  specs.push(...legend(c, mode === "change" ? "change" : "gap", box.x, box.y + 6))
  const figure = (a: Area) => (mode === "change" ? signed(change(a, c)) : years(value(a, c)))
  const lp = hex.points[areaIndex(c, low)]
  const hp = hex.points[areaIndex(c, high)]
  specs.push(...pill(`lab:${low}`, lp, w / 2, pairOf(c).low.name, figure(data.areas[areaIndex(c, low)]), c, { side: "left", lift: 16, tone: BRICK }))
  specs.push(...pill(`lab:${high}`, hp, w / 2, pairOf(c).high.name, figure(data.areas[areaIndex(c, high)]), c, { side: "right", lift: 16, tone: TEAL }))
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high) specs.push(...followSpecs(c, hex.points[fi], w / 2, figure(data.areas[fi]), hex.points[fi].x > box.x + box.w / 2 ? "right" : "left"))
  return specs
}

// ——— II. The stall ————————————————————————————————————————————————

function stallDomain(c: Ctx): [number, number] {
  return cached(`sdom:${c.sex}`, () => {
    const v = c.data.areas.flatMap((a) => a[c.sex]).filter((x): x is number => x !== null)
    return [Math.floor(Math.min(...v)) - 1, Math.ceil(Math.max(...v, c.data.stall[c.sex].trendNow)) + 1]
  })
}

/** Horizontal extent of every time chart; the period scrubber lines up with it. */
export function timeRange(box: Box, narrow: boolean): [number, number] {
  return [box.x + (narrow ? 28 : 40), box.x + box.w - (narrow ? 84 : 168)]
}

function timeScales(c: Ctx, domain: [number, number]) {
  const x = scaleLinear().domain([0, LAST]).range(timeRange(c.box, c.narrow))
  const y = scaleLinear().domain(domain).range([c.box.y + c.box.h - 30, c.box.y + 24])
  return { x, y }
}

function timeAxes(c: Ctx, x: (v: number) => number, y: ReturnType<typeof scaleLinear<number, number>>, title: string): Spec[] {
  const specs: Spec[] = []
  const [y0] = y.range()
  for (const v of y.ticks(c.box.h < 380 ? 4 : 6)) {
    specs.push(line(`yg:${v}`, x(0) - 6, y(v), x(LAST), y(v), { color: LINE, alpha: 0.9, layer: 0 }))
    specs.push(txt(`y:${v}`, x(0) - 12, y(v), String(v), { align: "right" }))
  }
  const idx = c.narrow ? [0, 10, LAST] : [0, 10, 16, LAST]
  for (const i of idx) specs.push(txt(`px:${i}`, x(i), y0 + 20, c.data.periods[i], { align: "center" }))
  specs.push(txt(`yt:${title}`, x(0) - 12, c.box.y - 2, title, { size: 10, caps: true, weight: 600 }))
  return specs
}

/** Big faint period behind time charts. */
function ghostYear(c: Ctx, x: number): TextSpec {
  const size = clamp(c.box.w * 0.13, 54, 140)
  return txt("year", x, c.box.y + 22, c.data.periods[Math.round(c.t)], {
    font: "display",
    weight: 300,
    size,
    color: INK,
    alpha: 0.075,
    baseline: "top",
    layer: 0,
  })
}

/** Stack labels so none overlap; each keeps its preferred y where it can. */
function spread<T extends { y: number }>(labels: T[], gap: number): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap
  return sorted
}

type Stage = "rewind" | "gains" | "flat" | "covid" | "pair"

function stallChart(c: Ctx, stage: Stage): Spec[] {
  const { data, sex, box } = c
  const t = c.t
  const dom = stallDomain(c)
  const { x, y } = timeScales(c, dom)
  const uk = data.uk[sex]
  const st = data.stall[sex]
  const specs: Spec[] = timeAxes(c, x, y, `${who(sex)} · life expectancy at birth, years`)
  const { low, high } = pairCodes(c)
  const trails = cached(`trails:${sex}:${bk(box)}`, () =>
    data.areas.map((a) => {
      const pts = new Float64Array(a[sex].length * 2)
      a[sex].forEach((v, i) => {
        pts[i * 2] = x(i)
        pts[i * 2 + 1] = v === null ? NaN : y(v)
      })
      return pts
    })
  )
  const ukPts = cached(`ukpts:${sex}:${bk(box)}`, () => Float64Array.from(uk.flatMap((v, i) => [x(i), y(v)])))
  const draw = t / LAST
  const hx = x(t)
  const heads: { id: string; y: number; value: number; name: string; colour: string; weight: number }[] = []
  const ukc = ukNow(c)

  data.areas.forEach((a, i) => {
    const special = a.code === low || a.code === high
    const followed = a.code === c.follow
    const col = gapColour(value(a, c), ukc)
    if (stage === "pair" && !special && !followed) {
      specs.push(path(`tr:${a.code}`, trails[i], { color: col, alpha: 0.1, width: 1, draw: 1, layer: 1 }))
      return
    }
    const tone = a.code === low ? BRICK : a.code === high ? TEAL : followed ? INK : col
    specs.push(
      path(`tr:${a.code}`, trails[i], {
        color: tone,
        alpha: special || followed ? 0.95 : 0.2,
        width: special ? (stage === "pair" ? 3 : 2.25) : followed ? 2 : 1,
        draw,
        layer: special || followed ? 4 : 1,
      })
    )
    const v = at(a[sex], t)
    if (v === null) return
    specs.push(
      mark(`a:${a.code}`, hx, y(v), special ? 11 : followed ? 10 : 5, tone, {
        hit: i,
        alpha: special || followed ? 1 : 0.85,
        stroke: special || followed ? PAPER : undefined,
        strokeW: special || followed ? 2 : 0,
        layer: special || followed ? 6 : 3,
        delay: (1 - (y(v) - box.y) / box.h) * 250,
        dur: 1150,
      })
    )
    if ((special && stage !== "pair") || followed) heads.push({ id: `head:${a.code}`, y: y(v), value: v, name: short(a.name, c.narrow), colour: tone, weight: 600 })
  })

  // The UK line, bold, drawn with time.
  const uv = at(uk, t) as number
  if (stage !== "pair") {
    specs.push(
      path("tr:uk", ukPts, { width: 3, draw, layer: 5 }),
      mark("uk:head", hx, y(uv), 12, INK, { stroke: PAPER, strokeW: 2.5, layer: 7, dur: 1150 })
    )
    heads.push({ id: "head:uk", y: y(uv), value: uv, name: "UK", colour: INK, weight: 700 })
  } else {
    specs.push(path("tr:uk", ukPts, { width: 1.5, draw, layer: 2, dash: [4, 4], color: INK_3 }))
    specs.push(txt("uk:pairlab", x(0) + 4, y(uk[0]) + 14, "UK", { size: 10.5, weight: 600, color: INK_3, halo: true }))
  }

  // Covid and the earlier trend, extended.
  if (stage === "covid") {
    specs.push(
      mark("covid", (x(17) + x(20)) / 2, (y(dom[0]) + y(dom[1])) / 2, x(20) - x(17), INK, { h: y(dom[0]) - y(dom[1]), rad: 0, alpha: 0.05, layer: 0, enter: "fade", arc: 0 }),
      txt("covid:lab", (x(17) + x(20)) / 2, y(dom[1]) - 12, "COVID-19", { align: "center", size: 10, caps: true, weight: 600 })
    )
    if (t >= LAST - 0.02) {
      specs.push(
        line("trend", x(10), y(st.stall), x(LAST), y(st.trendNow), { dash: [5, 5], width: 1.75, enter: "draw", dur: 1400, layer: 5 }),
        mark("trend:end", x(LAST), y(st.trendNow), 10, "none", { stroke: INK, strokeW: 1.75, layer: 7, enterDelay: 1300, arc: 0 }),
        line("short:br", x(LAST) - 12, y(st.trendNow) + 7, x(LAST) - 12, y(st.now) - 8, { width: 1.25, enter: "draw", delay: 1500, dur: 600, layer: 6 })
      )
      heads.push({ id: "head:trend", y: y(st.trendNow), value: st.trendNow, name: c.narrow ? "Trend" : "2001–13 trend", colour: INK_3, weight: 500 })
      specs.push(
        txt("short:lab", x(LAST) - 18, (y(st.trendNow) + y(st.now)) / 2, "", {
          value: st.shortfall,
          format: (v) => `${years(v)} ${c.narrow ? "yrs" : "years"} short`,
          align: "right",
          size: c.narrow ? 12 : 14,
          weight: 600,
          color: INK,
          halo: true,
          enter: { value: 0 },
          delay: 1700,
          dur: 900,
        })
      )
    }
  }

  // Pace of each stretch, above the UK line.
  const paceAt = (from: number, to: number, perYear: number, id: string, show: number) => {
    const m = (from + to) / 2
    specs.push(
      txt(id, x(m), y(at(uk, m) as number) - (c.narrow ? 18 : 24), `${signed(months(perYear))} months a year`, {
        align: "center",
        size: c.narrow ? 11 : 12.5,
        weight: 600,
        color: INK,
        halo: true,
        alpha: show,
      })
    )
  }
  if (stage === "gains" || stage === "flat" || stage === "covid") paceAt(0, 10, st.pre, "pace:pre", stage === "gains" ? clamp01((t - 9) / 1) : 0.4)
  if (stage === "flat" || stage === "covid") {
    paceAt(10, 16, st.post, "pace:post", stage === "flat" ? clamp01((t - 15) / 1) : 0.4)
    specs.push(
      line("stall:rule", x(10), y(dom[1]), x(10), y(dom[0]), { dash: [2, 4], alpha: 0.5, layer: 1 }),
      txt("stall:lab", x(10) + 6, y(dom[1]) - 12, "Gains slow", { size: 10, caps: true, weight: 600, color: INK })
    )
  }

  // Pair: the gap then and now.
  if (stage === "pair") {
    const P = pairOf(c).le
    const gapAt = (i: number) => (at(P.high, i) as number) - (at(P.low, i) as number)
    specs.push(
      line("pair:br0", x(0) + 10, y(P.high[0] as number) + 8, x(0) + 10, y(P.low[0] as number) - 8, { width: 1.25, enter: "draw", layer: 6 }),
      txt("pair:br0:lab", x(0) + 18, (y(P.high[0] as number) + y(P.low[0] as number)) / 2, `${years(gapAt(0))} years`, { size: c.narrow ? 13 : 16, font: "display", color: INK, halo: true, layer: 9 }),
      line("pair:brT", hx + 16, y(at(P.high, t) as number) + 8, hx + 16, y(at(P.low, t) as number) - 8, { width: 1.25, layer: 6 }),
      txt("pair:brT:lab", hx + 24, (y(at(P.high, t) as number) + y(at(P.low, t) as number)) / 2, "", {
        value: gapAt(t),
        format: (v) => `${years(v)} ${c.narrow ? "yrs" : "years"}`,
        size: c.narrow ? 14 : 18,
        font: "display",
        color: INK,
        halo: true,
      })
    )
  }

  for (const h of spread(heads, 17)) {
    specs.push(
      txt(h.id, hx + (stage === "pair" ? 14 : 12), h.y, "", {
        value: h.value,
        format: (v) => `${h.name} ${years(v)}`,
        size: c.narrow ? 11 : 12.5,
        weight: h.weight,
        color: h.colour,
        halo: true,
      })
    )
  }
  if (stage === "pair") {
    // Names ride above and below the lines.
    const P = pairOf(c).le
    specs.push(
      txt(`pairname:${high}`, hx + 14, y(at(P.high, t) as number) - 18, "", { value: at(P.high, t) as number, format: (v) => `${short(pairOf(c).high.name, c.narrow)} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: 600, color: TEAL, halo: true }),
      txt(`pairname:${low}`, hx + 14, y(at(P.low, t) as number) + 18, "", { value: at(P.low, t) as number, format: (v) => `${short(pairOf(c).low.name, c.narrow)} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: 600, color: BRICK, halo: true })
    )
  }
  specs.push(ghostYear(c, x(0) + 6))
  return specs
}

// ——— III. The split ————————————————————————————————————————————————

function rowGeo(c: Ctx, count: number, o: { top?: number; right?: number; bottom?: number } = {}) {
  const labelW = c.narrow ? 34 : 128
  const left = c.box.x + labelW
  const right = c.box.x + c.box.w - (o.right ?? 0)
  const top = c.box.y + (o.top ?? 30)
  const bottom = c.box.y + c.box.h - (o.bottom ?? 30)
  const rowH = (bottom - top) / count
  return { left, right, top, bottom, rowH, y: (r: number) => top + rowH * (r + 0.5), labelX: c.box.x }
}

const rowName = (row: number, narrow: boolean) =>
  row === 10 ? (narrow ? "W/S/NI" : "Wales, Scot., NI") : narrow ? String(row + 1) : row === 0 ? "1  most deprived" : row === 9 ? "10  least deprived" : String(row + 1)

function rowLabels(c: Ctx, g: ReturnType<typeof rowGeo>, count: number, followRow: number | null): Spec[] {
  return Array.from({ length: count }, (_, r) =>
    txt(`row:${r}`, g.labelX, g.y(r), rowName(r, c.narrow), {
      size: c.narrow ? 10.5 : 11.5,
      color: r === 10 ? INK_3 : INK,
      weight: r === followRow ? 700 : r === 0 || r === 9 ? 600 : 400,
    })
  )
}

function followRowOf(c: Ctx): number | null {
  const a = c.follow ? c.data.areas.find((x) => x.code === c.follow) : null
  return a?.decile ? a.decile - 1 : null
}

function tenths(c: Ctx, mode: "level" | "change"): Spec[] {
  const { data, sex } = c
  const g = rowGeo(c, 11, { right: mode === "change" ? (c.narrow ? 46 : 78) : 8, top: 44, bottom: 36 })
  const dom: [number, number] = mode === "level" ? leDomain(c) : [-2, 2.2]
  const x = scaleLinear().domain(dom).range([g.left, g.right])
  const r = clamp(g.rowH * 0.17, 2, 4.6)
  const pos = cached(`rows:${mode}:${sex}:${bk(c.box)}`, () => {
    const out: (Pt | null)[] = data.areas.map(() => null)
    for (let row = 0; row < 11; row += 1) {
      const members = data.areas.map((a, i) => ({ a, i })).filter(({ a }) => (row === 10 ? a.decile === null : a.decile === row + 1))
      const xs = members.map(({ a }) => {
        const v = mode === "change" ? change(a, c) : value(a, c)
        return v === null ? null : x(v)
      })
      const placed = dodge(xs, r, g.y(row), g.rowH / 2 - r)
      members.forEach(({ i }, k) => (out[i] = placed[k]))
    }
    return out
  })
  const specs: Spec[] = []
  data.areas.forEach((a, i) => {
    const p = pos[i]
    if (!p) return
    const eng = a.decile !== null
    const fill = mode === "change" ? changeColour(change(a, c)) : eng ? decileColour(a.decile as number) : NO_DATA
    specs.push(
      mark(`a:${a.code}`, p.x, p.y, r * 2, fill, {
        hit: i,
        alpha: eng ? 1 : 0.45,
        delay: (a.decile ?? 11) * 45 + ((p.x - g.left) / (g.right - g.left)) * 200,
        dur: 1200,
        layer: 3,
      })
    )
  })
  const means = data.deciles[sex].map((row) => (mode === "change" ? row[now(c)] - row[data.index.stall] : row[now(c)]))
  means.forEach((m, d) => {
    specs.push(line(`mean:${d}`, x(m), g.y(d) - g.rowH * 0.42, x(m), g.y(d) + g.rowH * 0.42, { width: 2.5, layer: 6, delay: 500 + d * 40 }))
    if (mode === "level" && (d === 0 || d === 9))
      specs.push(txt(`meanlab:${d}`, x(m) + 7, g.y(d) - g.rowH * 0.3, years(m), { size: 11, weight: 700, color: INK, halo: true, delay: 900 }))
    if (mode === "change")
      specs.push(
        txt(`avg:${d}`, c.box.x + c.box.w, g.y(d), "", {
          value: m,
          format: (v) => signed(v),
          align: "right",
          size: c.narrow ? 11 : 12.5,
          weight: 700,
          color: m < 0 ? BRICK : TEAL,
          delay: 600 + d * 50,
        })
      )
  })
  specs.push(...rowLabels(c, g, 11, followRowOf(c)))
  specs.push(txt("rows:title", g.labelX, g.top - 26, c.narrow ? "Deprivation tenth" : "Deprivation tenth of local authority (IMD 2025)", { size: 10, caps: true, weight: 600 }))
  const axisY = g.bottom + 22
  if (mode === "level") {
    const ticks = x.ticks(c.narrow ? 4 : 7).filter((t) => t >= dom[0] && t <= dom[1])
    specs.push(...xTicks("x", x, ticks, axisY, { grid: [g.top, g.bottom] }))
    specs.push(txt(`xt:le:${sex}`, g.right, axisY + 20, `${who(sex)}, life expectancy at birth →`, { align: "right", size: 10.5 }))
  } else {
    specs.push(...xTicks("xc", x, [-2, -1, 0, 1, 2], axisY, { fmt: (v) => signed(v, 0), grid: [g.top, g.bottom] }))
    specs.push(
      line("zero", x(0), g.top - 12, x(0), g.bottom, { width: 1.25, layer: 2 }),
      txt("fell", x(0) - 8, g.top - 12, "← fell", { align: "right", size: 11.5, weight: 600, color: BRICK }),
      txt("rose", x(0) + 8, g.top - 12, "rose →", { size: 11.5, weight: 600, color: TEAL }),
      txt("avg:title", c.box.x + c.box.w, g.top - 12, c.narrow ? "Avg" : "Average", { align: "right", size: 10, caps: true, weight: 600 }),
      txt("xt:change", g.right, axisY + 20, `Change in ${who(sex).toLowerCase()}'s life expectancy since 2011–13, years →`, { align: "right", size: 10.5 })
    )
  }
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && pos[fi]) specs.push(...followSpecs(c, pos[fi], r, mode === "change" ? signed(change(data.areas[fi], c)) : years(value(data.areas[fi], c)), "above"))
  return specs
}

function decileDomain(c: Ctx): [number, number] {
  return cached(`ddom:${c.sex}`, () => {
    const v = c.data.deciles[c.sex].flat()
    return [Math.floor(Math.min(...v)) - 1, Math.ceil(Math.max(...v)) + 1]
  })
}

function widening(c: Ctx): Spec[] {
  const { data, sex, box } = c
  const t = c.t
  const rows = data.deciles[sex]
  const { x, y } = timeScales(c, decileDomain(c))
  const specs: Spec[] = timeAxes(c, x, y, `${who(sex)} · England · life expectancy by deprivation tenth`)
  const hx = x(t)
  const lines = cached(`dlines:${sex}:${bk(box)}`, () => rows.map((r) => Float64Array.from(r.flatMap((v, i) => [x(i), y(v)]))))
  const followRow = followRowOf(c)
  rows.forEach((row, d) => {
    const edge = d === 0 || d === 9
    const col = decileColour(d + 1)
    specs.push(
      path(`decl:${d}`, lines[d], { color: col, width: edge ? 3 : d === followRow ? 2 : 1.25, alpha: edge || d === followRow ? 1 : 0.55, draw: t / LAST, layer: 2 }),
      mark(`dec:${d}`, hx, y(at(row, t) as number), edge ? 12 : 8, col, { stroke: PAPER, strokeW: 1.75, layer: 5, enterDelay: 500 + d * 40, dur: 900 })
    )
  })
  // Places merge into their tenth's head.
  data.areas.forEach((a) => {
    if (a.decile === null) return
    const d = a.decile - 1
    specs.push(mark(`a:${a.code}`, hx, y(at(rows[d], t) as number), 4, decileColour(a.decile), { alpha: 0, dur: 1300, delay: d * 40, layer: 4 }))
  })
  const m0 = at(rows[0], t) as number
  const m9 = at(rows[9], t) as number
  const labs = spread(
    [
      { id: "dlab:9", y: y(m9), v: m9, name: c.narrow ? "Least" : "Least deprived", col: decileColour(10) },
      { id: "dlab:0", y: y(m0), v: m0, name: c.narrow ? "Most" : "Most deprived", col: decileColour(1) },
    ],
    17
  )
  for (const l of labs)
    specs.push(txt(l.id, hx + 26, l.y, "", { value: l.v, format: (v) => `${l.name} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: 600, color: l.col, halo: true, enterDelay: 800 }))
  specs.push(
    line("dgap:br", hx + 14, y(m9) + 8, hx + 14, y(m0) - 8, { width: 1.25, layer: 6, enterDelay: 800 }),
    txt("dgap:lab", hx + 26, (y(m9) + y(m0)) / 2, "", {
      value: m9 - m0,
      format: (v) => `${years(v)} ${c.narrow ? "yrs" : "years apart"}`,
      size: c.narrow ? 13 : 17,
      font: "display",
      color: INK,
      halo: true,
      enterDelay: 800,
    })
  )
  // Markers left behind at 2001–03 and 2011–13.
  for (const i of [0, 10]) {
    if (t < i + 0.6) continue
    const top = y(rows[9][i]) - 8
    const bottom = y(rows[0][i]) + 8
    specs.push(
      line(`dgap:${i}`, x(i), top, x(i), bottom, { width: 1, alpha: 0.6, dash: [2, 3], layer: 1, enter: "draw" }),
      txt(`dgap:${i}:lab`, x(i), top - 12, `${years(rows[9][i] - rows[0][i])} yrs`, { align: "center", size: 11.5, weight: 600, color: INK, halo: true })
    )
  }
  if (followRow !== null && c.follow) {
    const a = data.areas.find((x) => x.code === c.follow)
    if (a && followRow !== 0 && followRow !== 9)
      specs.push(txt("follow:declab", hx + 26, y(at(rows[followRow], t) as number), `${a.name}'s tenth`, { size: 11, weight: 600, color: INK_2, halo: true }))
  }
  specs.push(ghostYear(c, x(0) + 6))
  return specs
}

function avoidable(c: Ctx): Spec[] {
  const { data, sex } = c
  const rows = data.avoidable[sex]
  const g = rowGeo(c, 10, { top: 58, right: c.narrow ? 40 : 64, bottom: 40 })
  const counts = rows.map((r) => Math.round(r.now / UNIT))
  const most = Math.max(...counts, ...rows.map((r) => Math.round(r.then / UNIT)))
  const width = g.right - g.left
  const { lines, pitch } = [1, 2, 3, 4]
    .map((n) => ({ lines: n, pitch: Math.min(17, width / Math.ceil(most / n), (g.rowH * 0.8) / n) }))
    .reduce((a, b) => (b.pitch > a.pitch * 1.05 ? b : a))
  const r = pitch * 0.36
  const xOf = (col: number) => g.left + col * pitch + pitch / 2
  const yOf = (d: number, ln: number) => g.y(d) - ((lines - 1) * pitch) / 2 + ln * pitch
  const specs: Spec[] = []
  const followRow = followRowOf(c)
  rows.forEach((row, d) => {
    const col = decileColour(d + 1)
    for (let k = 0; k < counts[d]; k += 1) {
      const cx = Math.floor(k / lines)
      specs.push(
        mark(`u:${d}:${k}`, xOf(cx), yOf(d, k % lines), r * 2, col, {
          enter: { from: `dec:${d}`, w: r * 2 },
          enterDelay: 150 + cx * 14 + d * 30,
          delay: cx * 6 + d * 20,
          dur: 1000,
          layer: 3,
        })
      )
    }
    const endX = g.left + Math.ceil(counts[d] / lines) * pitch
    const thenX = g.left + (row.then / UNIT / lines) * pitch
    specs.push(
      line(`then:${d}`, thenX, g.y(d) - (lines * pitch) / 2 - 2, thenX, g.y(d) + (lines * pitch) / 2 + 2, { width: 1.75, color: INK, layer: 5, delay: 1400 + d * 40 }),
      txt(`cnt:${d}`, Math.max(endX, thenX) + 9, g.y(d), "", { value: row.now, format: (v) => String(Math.round(v)), size: c.narrow ? 11 : 12, weight: d === 0 || d === 9 ? 700 : 500, color: INK, enter: { value: 0 }, enterDelay: 300 + d * 60, dur: 1500 })
    )
  })
  specs.push(...rowLabels(c, g, 10, followRow))
  specs.push(
    txt("av:title", g.labelX, g.top - 38, `${who(sex)} · avoidable deaths under 75 · per 100,000 a year · ${data.avoidable.now}`, { size: 10, caps: true, weight: 600 }),
    mark("av:key:dot", g.left + 4, g.top - 16, r * 2, decileColour(3), { layer: 8, arc: 0 }),
    txt("av:key", g.left + 12, g.top - 16, `= ${UNIT} deaths per 100,000`, { size: 11, color: INK_2 }),
    line("av:key:then", g.left + (c.narrow ? 150 : 190), g.top - 23, g.left + (c.narrow ? 150 : 190), g.top - 9, { width: 1.75, layer: 8 }),
    txt("av:key:thenlab", g.left + (c.narrow ? 157 : 197), g.top - 16, `${data.avoidable.then} level`, { size: 11, color: INK_2 })
  )
  return specs
}

// ——— IV. Years in good health ————————————————————————————————————————

function healthy(c: Ctx): Spec[] {
  const { data, sex } = c
  const rows = data.healthy.rows
  const g = rowGeo(c, 10, { top: c.narrow ? 76 : 64, right: c.narrow ? 38 : 56, bottom: 44 })
  const x = scaleLinear().domain([0, 90]).range([g.left, g.right])
  const bh = Math.min(28, g.rowH * 0.64)
  const specs: Spec[] = []
  const followRow = followRowOf(c)
  rows.forEach((row, d) => {
    const h = row[sex].healthy
    const L = row[sex].life
    const y = g.y(d)
    specs.push(
      mark(`hb:${d}`, (x(0) + x(h)) / 2, y, x(h) - x(0), HEALTHY, { h: bh, rad: 3, arc: 0, enter: { x: x(0), w: 0, h: bh, alpha: 1 }, enterDelay: 350 + d * 60, dur: 1300, layer: 2 }),
      mark(`pb:${d}`, (x(h) + x(L)) / 2 + 1, y, Math.max(0, x(L) - x(h) - 2), POOR, { h: bh, rad: 3, hatch: true, arc: 0, enter: { x: x(h), w: 0, h: bh, alpha: 1 }, enterDelay: 1300 + d * 60, dur: 900, layer: 2 }),
      txt(`hbv:${d}`, x(h) - 8, y + 0.5, "", { value: h, format: (v) => years(v), align: "right", size: c.narrow ? 10.5 : 11.5, weight: 600, color: WHITE, enter: { value: 0 }, enterDelay: 350 + d * 60, dur: 1300, layer: 9 }),
      txt(`pbv:${d}`, (x(h) + x(L)) / 2 + 1, y + 0.5, years(L - h), { align: "center", size: c.narrow ? 10 : 11, color: INK_2, enterDelay: 1900 + d * 50, layer: 9, alpha: x(L) - x(h) > 34 ? 1 : 0 }),
      txt(`life:${d}`, x(L) + 8, y + 0.5, years(L), { size: c.narrow ? 11 : 12, weight: 700, color: INK, enterDelay: 2000 + d * 50 })
    )
    // Unit dots from the previous scene pour into the bar and fade.
    const n = Math.round(data.avoidable[sex][d].now / UNIT)
    for (let k = 0; k < n; k += 1) specs.push(mark(`u:${d}:${k}`, x(0) + (k / n) * (x(L) - x(0)), y, 2, HEALTHY, { alpha: 0, dur: 900, delay: k * 4, layer: 4 }))
  })
  // The healthy-years gap between the ends.
  const h0 = rows[0][sex].healthy
  const h9 = rows[9][sex].healthy
  const topY = g.top - 8
  specs.push(
    line("hg:0", x(h0), topY, x(h0), g.bottom, { dash: [2, 3], alpha: 0.6, enter: "draw", delay: 2600, layer: 6 }),
    line("hg:9", x(h9), topY, x(h9), g.bottom, { dash: [2, 3], alpha: 0.6, enter: "draw", delay: 2600, layer: 6 }),
    line("hg:br", x(h0), topY, x(h9), topY, { width: 1.25, enter: "draw", delay: 2900, layer: 6 }),
    txt("hg:lab", (x(h0) + x(h9)) / 2, topY - 14, "", { value: h9 - h0, format: (v) => `${years(v)} healthy years`, align: "center", size: c.narrow ? 13 : 16, font: "display", color: INK, halo: true, enter: { value: 0 }, delay: 3000, dur: 900 })
  )
  specs.push(...rowLabels(c, g, 10, followRow))
  const axisY = g.bottom + 22
  specs.push(...xTicks("age", x, [0, 20, 40, 60, 80], axisY, { grid: [g.top, g.bottom] }))
  specs.push(txt("age:title", g.right, axisY + 20, `Years from birth, ${data.healthy.period} →`, { align: "right", size: 10.5 }))
  const keyY = g.top - 44
  specs.push(
    txt("hl:title", g.labelX, keyY, `${who(sex)} · upper-tier areas by deprivation tenth`, { size: 10, caps: true, weight: 600 }),
    mark("hl:k1", g.labelX + 8, keyY + 22, 16, HEALTHY, { h: 10, rad: 2, arc: 0, layer: 8 }),
    txt("hl:k1t", g.labelX + 22, keyY + 22, "Years in good health", { size: 11, color: INK_2 }),
    mark("hl:k2", g.labelX + (c.narrow ? 8 : 172), keyY + (c.narrow ? 38 : 22), 16, POOR, { h: 10, rad: 2, hatch: true, arc: 0, layer: 8 }),
    txt("hl:k2t", g.labelX + (c.narrow ? 22 : 186), keyY + (c.narrow ? 38 : 22), "Not in good health", { size: 11, color: INK_2 })
  )
  return specs
}

// ——— V. What travels with it ——————————————————————————————————————————

function scatter(c: Ctx): Spec[] {
  const { data, sex, box } = c
  const f = data.factors[c.factor] ?? data.factors[0]
  const eng = data.areas.map((a, i) => ({ a, i })).filter(({ a }) => a.f[f.key] !== null && value(a, c) !== null)
  const xs = eng.map(({ a }) => a.f[f.key] as number)
  const left = box.x + (c.narrow ? 30 : 44)
  const right = box.x + box.w - 12
  const top = box.y + 30
  const bottom = box.y + box.h - 40
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).nice(5).range([left, right])
  const yd = cached(`scy:${sex}`, () => {
    const v = data.areas.filter((a) => a.nation === "E").map((a) => value(a, c) as number)
    return [Math.floor(Math.min(...v)) - 0.5, Math.ceil(Math.max(...v)) + 0.5] as [number, number]
  })
  const y = scaleLinear().domain(yd).range([bottom, top])
  const r = clamp(box.w / 150, 2.8, 5)
  const specs: Spec[] = []
  for (const v of y.ticks(5)) {
    specs.push(line(`yg:${v}`, left - 6, y(v), right, y(v), { color: LINE, alpha: 0.9, layer: 0 }))
    specs.push(txt(`y:${v}`, left - 12, y(v), String(v), { align: "right" }))
  }
  const fmt = (v: number) => (f.unit === "%" ? `${v}%` : String(v))
  for (const v of x.ticks(5)) {
    specs.push(txt(`f:${f.key}:${v}`, x(v), bottom + 20, fmt(v), { align: "center" }))
    specs.push(line(`fg:${f.key}:${v}`, x(v), top, x(v), bottom, { color: LINE, alpha: 0.6, layer: 0 }))
  }
  specs.push(
    txt(`xt:${f.key}`, right, bottom + 40, `${f.label}, ${f.period} →`, { align: "right", size: 10.5 }),
    txt(`yt:sc:${sex}`, left - 12, top - 22, `${who(sex)} · life expectancy at birth`, { size: 10, caps: true, weight: 600 })
  )
  const { low, high } = pairCodes(c)
  for (const { a, i } of eng) {
    const special = a.code === low || a.code === high
    specs.push(
      mark(`a:${a.code}`, x(a.f[f.key] as number), y(value(a, c) as number), special ? r * 2 + 3 : r * 2, decileColour(a.decile as number), {
        hit: i,
        alpha: 0.92,
        stroke: special ? INK : PAPER,
        strokeW: special ? 1.5 : 0.6,
        enter: { from: `hb:${(a.decile as number) - 1}`, w: 3 },
        enterDelay: 150 + (a.decile as number) * 50 + Math.abs(Math.sin(i)) * 400,
        delay: Math.abs(Math.sin(i * 7.3)) * 250,
        dur: 1250,
        layer: special ? 5 : 3,
      })
    )
  }
  // Least-squares line across the observed range.
  const fit = f.fit[sex]
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  specs.push(line("fit", x(x0), y(fit.intercept + fit.slope * x0), x(x1), y(fit.intercept + fit.slope * x1), { width: 2, layer: 6, alpha: 0.85, enter: "draw", dur: 1100, enterDelay: 1400 }))
  specs.push(
    txt("r", right, top - 22, "", {
      value: fit.r,
      format: (v) => `r = ${signed(v, 2)}`,
      align: "right",
      size: c.narrow ? 15 : 20,
      font: "display",
      color: INK,
      enterDelay: 1500,
    })
  )
  if (f.england !== null)
    specs.push(
      line("eng", x(f.england), top, x(f.england), bottom, { dash: [2, 3], alpha: 0.6, layer: 1 }),
      txt("eng:lab", x(f.england) + 5, bottom - 10, `England ${years(f.england, f.decimals)}${f.unit === "%" ? "%" : ""}`, { size: 10.5, color: INK_2, halo: true })
    )
  const li = areaIndex(c, low)
  const hi = areaIndex(c, high)
  const lp = { x: x(data.areas[li].f[f.key] as number), y: y(value(data.areas[li], c) as number) }
  const hp = { x: x(data.areas[hi].f[f.key] as number), y: y(value(data.areas[hi], c) as number) }
  const fx = (a: Area) => (f.unit === "%" ? `${years(a.f[f.key])}%` : years(a.f[f.key], f.decimals))
  specs.push(...pill(`lab:${low}`, lp, r + 1.5, pairOf(c).low.name, fx(data.areas[li]), c, { side: lp.x > (left + right) / 2 ? "left" : "right", lift: 14, tone: BRICK }))
  specs.push(...pill(`lab:${high}`, hp, r + 1.5, pairOf(c).high.name, fx(data.areas[hi]), c, { side: hp.x > (left + right) / 2 ? "left" : "right", lift: 14, tone: TEAL }))
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high && data.areas[fi].f[f.key] !== null) {
    const p = { x: x(data.areas[fi].f[f.key] as number), y: y(value(data.areas[fi], c) as number) }
    specs.push(...followSpecs(c, p, r, fx(data.areas[fi]), "above"))
  }
  return specs
}

// ——— VI. Two places ———————————————————————————————————————————————

function pairWhy(c: Ctx): Spec[] {
  const { data, sex, box } = c
  const P = pairOf(c)
  const av = P.avoidable
  const last = av.low.length - 1
  // England-only rows use a stand-in when a place is outside England.
  const sub = { low: P.standIn.low, high: P.standIn.high }
  const rows = [
    {
      key: "hle",
      label: "Healthy life expectancy",
      note: `years, ${data.hlePeriod}${P.hle.high === null ? `; not published for districts such as ${P.high.name}` : ""}`,
      low: P.hle.low,
      high: P.hle.high,
      england: P.hle.england,
      unit: "",
      stand: false,
    },
    { key: "av", label: `Avoidable deaths under 75, ${who(sex).toLowerCase()}`, note: `per 100,000, ${data.avPeriods[last]}`, low: av.low[last], high: av.high[last], england: av.england[last], unit: "", stand: true },
    ...P.factors.map((f) => ({ key: f.key, label: f.label, note: `${f.unit === "%" ? "%" : f.unit}, ${f.period}`, low: f.low, high: f.high, england: f.england, unit: f.unit === "%" ? "%" : "", stand: true })),
  ]
  const left = box.x + 4
  const right = box.x + box.w - (c.narrow ? 54 : 92)
  const rowH = box.h / rows.length
  const specs: Spec[] = []
  const { low, high } = pairCodes(c)
  rows.forEach((row, k) => {
    // Phones: label, then the track with values below it; England's tick carries no text.
    const top = box.y + rowH * k + (c.narrow ? 2 : 14)
    const trackY = top + (c.narrow ? 24 : 46)
    const max = Math.max(row.low ?? 0, row.high ?? 0, row.england ?? 0) * 1.12
    const x = scaleLinear().domain([0, max]).range([left, right])
    const delay = k * 160
    const digits = row.unit === "%" || row.key === "hle" ? 1 : 0
    specs.push(
      txt(`pw:${row.key}:label`, left, top, row.label, { size: c.narrow ? 11.5 : 14, weight: 600, color: INK, delay, enter: "rise" }),
      txt(`pw:${row.key}:note`, left, top + 18, row.note, { size: 11, color: INK_3, delay, enter: "rise", alpha: c.narrow ? 0 : 1 }),
      line(`pw:${row.key}:track`, x(0), trackY, x(max), trackY, { color: LINE, width: 2, enter: "draw", delay, dur: 900, layer: 1 })
    )
    if (row.england !== null)
      specs.push(
        line(`pw:${row.key}:eng`, x(row.england), trackY - 8, x(row.england), trackY + 8, { width: 1.5, color: INK_3, delay: delay + 300, layer: 2 }),
        txt(`pw:${row.key}:englab`, x(row.england), trackY + 20, `England ${years(row.england, digits)}${row.unit}`, { align: "center", size: 10.5, color: INK_3, delay: delay + 300, alpha: c.narrow ? 0 : 1 })
      )
    const dots = [
      { side: "low", v: row.low, colour: BRICK, from: `a:${low}`, stand: row.stand ? sub.low : null },
      { side: "high", v: row.high, colour: TEAL, from: `a:${high}`, stand: row.stand ? sub.high : null },
    ]
    for (const d of dots) {
      if (d.v === null) continue
      // A stand-in shows hollow and named, and doesn't fly out of the place it replaces.
      specs.push(
        mark(`pw:${row.key}:${d.side}`, x(d.v), trackY, c.narrow ? 13 : 16, d.stand ? "none" : d.colour, {
          stroke: d.stand ? d.colour : PAPER,
          strokeW: 2,
          enter: d.stand ? "grow" : { from: d.from },
          enterDelay: 300 + delay,
          dur: 1200,
          layer: 5,
        }),
        txt(`pw:${row.key}:${d.side}:v`, x(d.v), trackY + (c.narrow ? 17 : -20), `${d.stand ? `${short(d.stand.name, c.narrow)} ` : ""}${years(d.v, digits)}${row.unit}`, {
          align: "center",
          size: c.narrow ? 11.5 : 12.5,
          weight: 700,
          color: d.colour,
          halo: true,
          enterDelay: 900 + delay,
        })
      )
    }
    // Healthy years compare as a difference, the rest as a ratio; against England when the other place is missing.
    const other = row.high ?? row.england
    const ratio = row.low !== null && other !== null ? (row.key === "hle" ? row.low - other : row.low / other) : null
    if (ratio !== null)
      specs.push(
        txt(`pw:${row.key}:vs`, box.x + box.w, trackY + (c.narrow ? 15 : 20), row.high === null ? "vs England" : "", { align: "right", size: 10, color: INK_3, enterDelay: 1000 + delay }),
        txt(`pw:${row.key}:ratio`, box.x + box.w, trackY, "", {
          value: ratio,
          format: (v) => (row.key === "hle" ? `${signed(v)}${c.narrow ? "" : " yrs"}` : `${v.toFixed(1)}×`),
          align: "right",
          size: c.narrow ? 17 : row.key === "hle" ? 22 : 26,
          font: "display",
          color: INK,
          enter: { value: row.key === "hle" ? 0 : 1 },
          enterDelay: 1000 + delay,
          dur: 1000,
        })
      )
  })
  const keyW = textWidth(P.low.name, 11.5, 600)
  specs.push(
    mark("pw:key:low", left + 5, box.y - 16, 10, BRICK, { arc: 0, layer: 8 }),
    txt("pw:key:lowt", left + 15, box.y - 16, P.low.name, { size: 11.5, weight: 600, color: INK }),
    mark("pw:key:high", left + keyW + 32, box.y - 16, 10, TEAL, { arc: 0, layer: 8 }),
    txt("pw:key:hight", left + keyW + 42, box.y - 16, P.high.name, { size: 11.5, weight: 600, color: INK }),
    txt("pw:key:ratio", box.x + box.w, box.y - 16, "Difference", { align: "right", size: 10, caps: true, weight: 600 })
  )
  return specs
}

// ——— The film ——————————————————————————————————————————————————

export const CHAPTERS = ["The gap", "The stall", "The split", "Healthy years", "Circumstances", "Two places", "Your place"]

export const SCENES: SceneDef[] = [
  { id: "open", chapter: 0, build: open, aria: (c) => `Two lifelines: ${pairOf(c).high.name} and ${pairOf(c).low.name}, ten years apart` },
  { id: "swarm", chapter: 0, build: swarm, aria: () => "Every UK local authority on one life expectancy axis" },
  { id: "map", chapter: 0, build: (c) => map(c, "gap"), aria: () => "Hex map of UK local authorities coloured by gap to the UK average" },
  { id: "ends", chapter: 0, build: (c) => map(c, "ends"), aria: () => "Hex map with the ten highest and ten lowest places ringed" },
  { id: "rewind", chapter: 1, time: { from: 0, to: 0, ms: 0 }, build: (c) => stallChart(c, "rewind"), aria: () => "Every place in 2001–03, on a timeline" },
  { id: "gains", chapter: 1, time: { from: 0, to: 10, ms: 4200, delay: 400 }, build: (c) => stallChart(c, "gains"), aria: () => "Life expectancy rising from 2001–03 to 2011–13" },
  { id: "flat", chapter: 1, time: { from: 10, to: 16, ms: 3000, delay: 300 }, build: (c) => stallChart(c, "flat"), aria: () => "Life expectancy flattening from 2011–13 to 2017–19" },
  { id: "covid", chapter: 1, time: { from: 16, to: LAST, ms: 3000, delay: 300 }, build: (c) => stallChart(c, "covid"), aria: () => "COVID-19 and the shortfall against the earlier trend" },
  { id: "tenths", chapter: 2, build: (c) => tenths(c, "level"), aria: () => "English local authorities in ten deprivation groups" },
  { id: "moved", chapter: 2, build: (c) => tenths(c, "change"), aria: () => "Change in life expectancy since 2011–13 by deprivation group" },
  { id: "widening", chapter: 2, time: { from: 0, to: LAST, ms: 6500, delay: 1300 }, build: widening, aria: () => "Mean life expectancy of each deprivation tenth over time" },
  { id: "avoidable", chapter: 2, build: avoidable, aria: () => "Avoidable deaths under 75 by deprivation tenth, one dot per five deaths per 100,000" },
  { id: "healthy", chapter: 3, build: healthy, aria: () => "Years in good health and not in good health by deprivation tenth" },
  { id: "poverty", chapter: 4, build: (c) => scatter({ ...c, factor: 0 }), aria: () => "Child poverty against life expectancy, English local authorities" },
  { id: "factors", chapter: 4, factors: true, build: scatter, aria: (c) => `${c.data.factors[c.factor]?.label ?? ""} against life expectancy` },
  { id: "pair", chapter: 5, time: { from: 0, to: LAST, ms: 5500, delay: 1100 }, build: (c) => stallChart(c, "pair"), aria: (c) => `${pairOf(c).low.name} and ${pairOf(c).high.name} over time` },
  { id: "why", chapter: 5, build: pairWhy, aria: (c) => `${pairOf(c).low.name} and ${pairOf(c).high.name} compared` },
  { id: "close", chapter: 6, build: (c) => map(c, "change"), aria: () => "Hex map coloured by change in life expectancy since 2011–13" },
]
