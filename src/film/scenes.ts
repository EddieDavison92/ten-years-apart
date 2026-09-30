import { scaleLinear } from "d3-scale"
import type { LineSpec, MarkSpec, PathSpec, Spec, TextSpec } from "@/film/engine"
import { at, cached, dodge, hexLayout, type Box, type Pt } from "@/film/geo"
import { textWidth } from "@/film/measure"
import type { Area, FilmData, Sex } from "@/lib/film/compute"
import { months, nth, signed, years } from "@/lib/film/format"
import {
  BRICK,
  clamp01,
  decileColour,
  DIVERGING,
  diverging,
  FOLLOW,
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
} from "@/lib/film/palette"

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

/** A point in time: a period index, or a named period resolved from the data. */
type Mark = number | "stall" | "precovid" | "now"

export type SceneDef = {
  id: string
  chapter: number
  /** Plays time between two marks over `ms`, after `delay`: ONS periods, or calendar years for countries. */
  time?: { from: Mark; to: Mark; ms: number; delay?: number; axis?: "periods" | "years" | "avoidable" }
  /** Shows the factor switcher. */
  factors?: boolean
  build: (c: Ctx) => Spec[]
  aria: (c: Ctx) => string
}

// Colours saturate at ±4.5 years for the gap to the UK and ±1.5 years for change since 2011–13.
export const GAP_SPAN = 4.5
export const CHANGE_SPAN = 1.5
const WHITE = "#ffffff"
/** Deaths per 100,000 that one dot stands for. */
/** Hover indices at or above this are OECD countries (index into data.intl.countries), below are local areas. */
export const COUNTRY_HIT = 1000
/** New axis ticks appear after existing ones finish moving, ms. */
const TICK_WAIT = 600

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

/** Timing of the mark a label belongs to, so the label travels with it. */
type Timing = { delay?: number; dur?: number; enterDelay?: number }

/**
 * Label in a white pill with a leader to its anchor. Name in ink, figure in grey.
 * Every part moves on its anchor's timing; a new pill fades in once its anchor has landed.
 */
function pill(
  key: string,
  anchor: Pt,
  r: number,
  name: string,
  figure: string,
  c: Ctx,
  o: { side?: "above" | "below" | "left" | "right"; lift?: number; alpha?: number; tone?: string; at?: Timing } = {}
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
  const at = o.at ?? {}
  const t = { delay: at.delay ?? 0, dur: at.dur ?? 1000, enterDelay: (at.enterDelay ?? at.delay ?? 0) + (at.dur ?? 1000) * 0.85, ease: "inOut" as const }
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
    line(`${key}:lead`, lead[0], lead[1], lead[2], lead[3], { color: o.tone ?? INK, alpha: a * 0.8, layer: 9, ...t }),
    mark(`${key}:bg`, cx, cy, w, WHITE, { h, rad: h / 2, stroke: "#d6d5cf", strokeW: 1, layer: 10, arc: 0, enter: "fade", alpha: a, ...t }),
    txt(`${key}:name`, left, cy + 0.5, name, { size, weight: 600, color: o.tone ?? INK, layer: 11, alpha: a, ...t }),
    txt(`${key}:fig`, left + w1 + gap, cy + 0.5, figure, { size, color: INK_3, layer: 11, alpha: figure ? a : 0, ...t }),
  ]
}

/** Ring and label for the place the reader follows, in its own accent. */
function followSpecs(
  c: Ctx,
  p: Pt | null,
  r: number,
  figure: string,
  side: "above" | "below" | "left" | "right" = "above",
  at?: Timing,
  lift = 18
): Spec[] {
  if (!c.follow || !p) return []
  const a = c.data.areas.find((x) => x.code === c.follow)
  if (!a) return []
  return [
    mark("follow:ring", p.x, p.y, r * 2 + 9, "none", { stroke: FOLLOW, strokeW: 2, layer: 9, arc: 0, pulse: true, ...at }),
    ...pill("follow", p, r + 4, a.name, figure, c, { side, lift, tone: FOLLOW, at }),
  ]
}

/** Colour ramp legend for gap or change. */
function legend(c: Ctx, kind: "gap" | "change", x: number, y: number, heading?: string, scope = "map"): Spec[] {
  const w = c.narrow ? 140 : 180
  const sw = w / DIVERGING.length
  const span = kind === "gap" ? GAP_SPAN : CHANGE_SPAN
  const title = heading ?? (kind === "gap" ? `Gap to UK figure, ${years(ukNow(c))}` : "Change since 2011–13")
  return [
    // Ids carry a scope, so the map's legend and the timeline's crossfade instead of flying across the chart.
    txt(`leg:${scope}:title:${title}`, x, y, title, { size: 10, caps: true, weight: 600, color: INK_3 }),
    ...DIVERGING.map((col, i) => mark(`leg:${scope}:${i}`, x + sw * (i + 0.5), y + 17, sw - 1.5, col, { h: 7, rad: 1.5, layer: 8, arc: 0, enterDelay: 400 + i * 30 })),
    txt(`leg:${scope}:lo:${kind}`, x, y + 32, `${kind === "gap" ? "Shorter" : "Fell"} −${span}`, { size: 10.5, color: INK_2 }),
    txt(`leg:${scope}:hi:${kind}`, x + w, y + 32, `+${span} ${kind === "gap" ? "Longer" : "Rose"}`, { size: 10.5, color: INK_2, align: "right" }),
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
  // New ticks wait until ticks that persist have slid into place, so labels never overprint.
  for (const t of ticks) {
    out.push(txt(`${key}:${t}`, x(t), y, fmt(t), { align: "center", size: 11, enterDelay: TICK_WAIT }))
    if (o.grid) out.push(line(`${key}:g:${t}`, x(t), o.grid[0], x(t), o.grid[1], { color: LINE, layer: 0, enterDelay: TICK_WAIT }))
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
  // Lines are keyed by role, not place, so switching sex morphs the same two lines to the other pair.
  const rows = [
    { a: hi, role: "high", v: hv, y: mid - gap / 2, colour: TEAL, delay: 250 },
    { a: lo, role: "low", v: lv, y: mid + gap / 2, colour: BRICK, delay: 650 },
  ]
  // A first draw is slow; later moves (a new sex) take MOVE ms, and the gap moves with them.
  const MOVE = 1200
  const specs: Spec[] = []
  for (const r of rows) {
    const i = areaIndex(c, r.a.code)
    specs.push(
      line(`life:${r.role}`, x(0), r.y, x(r.v), r.y, { color: r.colour, width: c.narrow ? 3 : 4, enter: "draw", dur: MOVE, enterDur: DRAW, enterDelay: r.delay, layer: 2 }),
      mark(`born:${r.role}`, x(0), r.y, c.narrow ? 7 : 9, r.colour, { enterDelay: r.delay, dur: 500, layer: 3 }),
      // Line tips ride the lines as they draw; the swarm's dots split out of them.
      mark(`tip:${r.role}`, x(r.v), r.y, c.narrow ? 14 : 18, r.colour, {
        hit: i,
        enter: { x: x(0), w: c.narrow ? 14 : 18, alpha: 0 },
        enterDelay: r.delay,
        dur: MOVE,
        enterDur: DRAW,
        arc: 0,
        stroke: PAPER,
        strokeW: 2.5,
        layer: 4,
      }),
      txt(`name:${r.role}:${r.a.code}`, x(0), r.y - (c.narrow ? 18 : 22), r.a.name, { size: c.narrow ? 13 : 15, weight: 600, color: INK, enterDelay: r.delay, enter: "rise" }),
      txt(`val:${r.role}`, x(r.v) + (c.narrow ? 13 : 17), r.y + 1, "", {
        value: r.v,
        format: (v) => years(v),
        size: c.narrow ? 20 : 27,
        font: "display",
        color: INK,
        enter: { x: x(0) + (c.narrow ? 13 : 17), value: 0, alpha: 0 },
        enterDelay: r.delay,
        dur: MOVE,
        enterDur: DRAW,
      })
    )
  }
  // The last ten years of the longer line: the gap itself.
  const top = rows[0].y - (c.narrow ? 36 : 46)
  const bottom = rows[1].y + (c.narrow ? 20 : 26)
  const cx = (x(lv) + x(hv)) / 2
  const after = DRAW + 800
  specs.push(
    mark("gap:band", cx, (top + bottom) / 2, x(hv) - x(lv), INK, { h: bottom - top, rad: 6, alpha: 0.06, layer: 0, enter: "fade", enterDelay: after, dur: MOVE, arc: 0 }),
    line("gap:guide", x(lv), rows[0].y - 10, x(lv), rows[1].y - 12, { dash: [2, 4], alpha: 0.55, enter: "draw", enterDelay: after, dur: MOVE, enterDur: 700 }),
    line("gap:br", x(lv), bottom + 12, x(hv), bottom + 12, { width: 1.25, enter: "draw", enterDelay: after + 200, dur: MOVE, enterDur: 800 }),
    line("gap:brL", x(lv), bottom + 6, x(lv), bottom + 18, { width: 1.25, enterDelay: after + 200, dur: MOVE }),
    line("gap:brR", x(hv), bottom + 6, x(hv), bottom + 18, { width: 1.25, enterDelay: after + 200, dur: MOVE }),
    txt("gap:label", cx, bottom + 38, "", {
      value: hv - lv,
      format: (v) => `${years(v)} years`,
      size: c.narrow ? 20 : 26,
      font: "display",
      color: INK,
      align: "center",
      enter: { value: 0 },
      enterDelay: after + 400,
      dur: MOVE,
      enterDur: 1100,
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
        enter: special ? { from: `tip:${a.code === low ? "low" : "high"}` } : "grow",
        stroke: special ? INK : undefined,
        strokeW: special ? 1.25 : 0,
        delay: ((p.x - box.x) / box.w) * 300,
        enterDelay: special ? 250 : 700 + ranks[i] * 4.5,
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
    // The bracket moves on the end dots' timing, so its ends stay over them.
    line("gap:br", lp.x, brY, hp.x, brY, { width: 1.25, delay: 250, dur: 1100 }),
    line("gap:brL", lp.x, brY - 6, lp.x, brY + 6, { width: 1.25, delay: 250, dur: 1100 }),
    line("gap:brR", hp.x, brY - 6, hp.x, brY + 6, { width: 1.25, delay: 250, dur: 1100 }),
    txt("gap:label", (lp.x + hp.x) / 2, brY - 22, "", {
      delay: 250,
      dur: 1100,
      value: (value(data.areas[areaIndex(c, high)], c) as number) - (value(data.areas[areaIndex(c, low)], c) as number),
      format: (v) => `${years(v)} years`,
      size: c.narrow ? 18 : 22,
      font: "display",
      color: INK,
      align: "center",
    })
  )
  const swarmAt = (p: Pt): Timing => ({ delay: ((p.x - box.x) / box.w) * 300, dur: 1100, enterDelay: 250 })
  // Labels hang below the swarm when there's room above the axis; otherwise they sit beside the end dots.
  const below = box.y + box.h - 30 - (bottomY + r) > 70
  const place = (p: Pt, side: "left" | "right") => (below ? { side: "below" as const, lift: bottomY - p.y + 18 } : { side, lift: 12 })
  specs.push(...pill(`lab:${low}`, lp, r + 1, pairOf(c).low.name, years(value(data.areas[areaIndex(c, low)], c)), c, { ...place(lp, "left"), tone: BRICK, at: swarmAt(lp) }))
  specs.push(...pill(`lab:${high}`, hp, r + 1, pairOf(c).high.name, years(value(data.areas[areaIndex(c, high)], c)), c, { ...place(hp, "right"), tone: TEAL, at: swarmAt(hp) }))
  const axisY = box.y + box.h - 6
  const ticks = x.ticks(c.narrow ? 5 : 8).filter((t) => t >= dom[0] && t <= dom[1])
  specs.push(line("age:base", x(dom[0]), axisY - 14, x(dom[1]), axisY - 14, { color: LINE, layer: 0 }))
  specs.push(...xTicks("x", x, ticks, axisY, { ghosts: { key: "age", ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] } }))
  specs.push(txt(`xt:le:${sex}`, x(dom[1]), axisY + 20, `${who(sex)}, life expectancy at birth, ${data.periods[now(c)]} →`, { align: "right", size: 10.5 }))
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high && pos[fi])
    specs.push(...followSpecs(c, pos[fi], r, years(value(data.areas[fi], c)), "above", { ...swarmAt(pos[fi] as Pt), enterDelay: 700 + ranks[fi] * 4.5 }))
  return specs
}

function mapPositions(c: Ctx) {
  const inset = c.narrow ? 4 : 12
  // Phones keep a strip above the map for the legend, which would otherwise sit on Scotland.
  const top = c.narrow ? 52 : inset
  const box = { x: c.box.x + inset, y: c.box.y + top, w: c.box.w - inset * 2, h: c.box.h - top - inset }
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
  // North moves first; on the closing scene the map rebuilds from the south.
  const byValue = cached(`rank:${c.sex}`, () => {
    const order = data.areas.map((a, i) => ({ i, v: value(a, c) ?? Infinity })).sort((a, b) => a.v - b.v)
    const out = new Array<number>(order.length)
    order.forEach((o, k) => (out[o.i] = k))
    return out
  })
  // Leaving the swarm, dots set off shortest-lived first, so the flight paints the colour scale; later map scenes move north first.
  const mapAt = (p: Pt, i = -1): Timing => ({
    delay: mode === "gap" && i >= 0 ? (byValue[i] / data.areas.length) * 500 : ((p.y - box.y) / box.h) * 380,
    enterDelay: 300 + ((box.y + box.h - p.y) / box.h) * 1500 + Math.abs(p.x - (box.x + box.w / 2)) * 0.6,
    dur: 1200,
  })
  const xs = hex.points.map((p) => p.x)
  const [landL, landR] = [Math.min(...xs) - w / 2, Math.max(...xs) + w / 2]
  const specs: Spec[] = []
  data.areas.forEach((a, i) => {
    const p = hex.points[i]
    const fill = mode === "change" ? changeColour(change(a, c)) : gapColour(value(a, c), uk)
    const dim = mode === "ends" && !ringed.has(a.code)
    // On the closing map the two places fly home from the comparison rows.
    const home = mode === "change" ? (a.code === low ? "pw:hle:low" : a.code === high ? "pw:av:high" : null) : null
    specs.push(
      mark(`a:${a.code}`, p.x, p.y, w, fill, {
        hit: i,
        alpha: dim ? 0.28 : 1,
        ...mapAt(p, i),
        ...(home ? { enter: { from: home }, enterDelay: 150 } : {}),
        layer: home ? 6 : ringed.has(a.code) ? 4 : 3,
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
    // Northern Ireland's label sits above its hexes, clear of the pills that lead off the west coast.
    if (n.key === "N") {
      specs.push(txt(`nation:${n.key}`, (Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - w * 1.1, label, { align: "center", size: 10, caps: true, weight: 600, color: INK_3, delay: 600, halo: true }))
      continue
    }
    // Caps carry 0.12em tracking, which measureText doesn't see.
    const tw = textWidth(label.toUpperCase(), 10, 600) + label.length * 1.2
    const edge = n.side < 0 ? Math.max(tw + 10, Math.min(...xs) - w) : Math.min(c.W - tw - 10, Math.max(...xs) + w)
    specs.push(txt(`nation:${n.key}`, edge, midY, label, { align: n.side < 0 ? "right" : "left", size: 10, caps: true, weight: 600, color: INK_3, delay: 600, halo: true }))
  }
  specs.push(...legend(c, mode === "change" ? "change" : "gap", box.x, box.y + 6))
  const figure = (a: Area) => (mode === "change" ? signed(change(a, c)) : years(value(a, c)))
  const lp = hex.points[areaIndex(c, low)]
  const hp = hex.points[areaIndex(c, high)]
  // Pills sit off the coast, past the edge of the land, so they hide no places.
  const out = (p: Pt, side: "left" | "right") => ({ side, lift: (side === "left" ? p.x - landL : landR - p.x) + 12 - w / 2 })
  const sideOf = (p: Pt) => (p.x < (landL + landR) / 2 ? "left" : "right")
  specs.push(...pill(`lab:${low}`, lp, w / 2, pairOf(c).low.name, figure(data.areas[areaIndex(c, low)]), c, { ...out(lp, sideOf(lp)), tone: BRICK, at: mapAt(lp) }))
  specs.push(...pill(`lab:${high}`, hp, w / 2, pairOf(c).high.name, figure(data.areas[areaIndex(c, high)]), c, { ...out(hp, sideOf(hp)), tone: TEAL, at: mapAt(hp) }))
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high) {
    const fp = hex.points[fi]
    const o = out(fp, sideOf(fp))
    specs.push(...followSpecs(c, fp, w / 2, figure(data.areas[fi]), o.side, mapAt(fp), o.lift))
  }
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
  const x = scaleLinear().domain([0, c.data.index.now]).range(timeRange(c.box, c.narrow))
  const y = scaleLinear().domain(domain).range([c.box.y + c.box.h - 30, c.box.y + 24])
  return { x, y }
}

function timeAxes(c: Ctx, x: (v: number) => number, y: ReturnType<typeof scaleLinear<number, number>>, title: string): Spec[] {
  const specs: Spec[] = []
  const [y0] = y.range()
  for (const v of y.ticks(c.box.h < 380 ? 4 : 6)) {
    specs.push(line(`yg:${v}`, x(0) - 6, y(v), x(c.data.index.now), y(v), { color: LINE, alpha: 0.9, layer: 0, enterDelay: TICK_WAIT }))
    specs.push(txt(`y:${v}`, x(0) - 12, y(v), String(v), { align: "right", enterDelay: TICK_WAIT }))
  }
  const { stall, precovid, now: last } = c.data.index
  const idx = c.narrow ? [0, stall, last] : [0, stall, precovid, last]
  for (const i of idx) specs.push(txt(`px:${i}`, x(i), y0 + 20, c.data.periods[i], { align: "center" }))
  specs.push(txt(`yt:${title}`, x(0) - 12, c.box.y - 2, title, { size: 10, caps: true, weight: 600 }))
  return specs
}

/** Resolved time settings for a scene: index range and the labels its scrubber shows. */
export function timeOf(scene: SceneDef, data: FilmData) {
  if (!scene.time) return null
  const labels =
    scene.time.axis === "years" ? data.intl.years.map(String) : scene.time.axis === "avoidable" ? [data.avoidable.then, data.avoidable.now] : data.periods
  const resolve = (m: Mark) => (typeof m === "number" ? m : m === "now" ? labels.length - 1 : data.index[m])
  return { ...scene.time, from: resolve(scene.time.from), to: resolve(scene.time.to), labels }
}

/** Big faint period behind time charts. */
function ghostYear(c: Ctx, x: number, labels = c.data.periods): TextSpec {
  const size = clamp(c.box.w * 0.13, 54, 140)
  return txt("year", x, c.box.y + 22, labels[Math.round(c.t)], {
    font: "display",
    weight: 300,
    size,
    color: INK,
    alpha: 0.075,
    baseline: "top",
    layer: 0,
  })
}

/** Stack labels so none overlap, each as near its preferred y as it can be, and all below `hi`. */
function spread<T extends { y: number }>(labels: T[], gap: number, hi = Infinity): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap
  if (sorted.length && sorted[sorted.length - 1].y > hi) {
    sorted[sorted.length - 1].y = hi
    for (let i = sorted.length - 2; i >= 0; i -= 1) if (sorted[i + 1].y - sorted[i].y < gap) sorted[i].y = sorted[i + 1].y - gap
  }
  return sorted
}

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Placeable = { id: string; x: number; y: number; r: number; lines: { text: string; size: number; weight: number; colour: string }[]; delay?: number }

/**
 * Places labels beside their dots without overprinting: each tries right, left, above, then below,
 * avoiding labels already placed and the given obstacles (other dots). Earlier items win.
 */
function placeLabels(items: Placeable[], obstacles: Rect[], bounds: Rect): Spec[] {
  const placed: Rect[] = []
  const outside = (r: Rect) => r.x0 < bounds.x0 || r.x1 > bounds.x1 || r.y0 < bounds.y0 || r.y1 > bounds.y1
  // Off-screen is ruled out; otherwise fewer overlaps win, with labels counting more than dots.
  const cost = (r: Rect) =>
    outside(r)
      ? Infinity
      : placed.filter((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0).length * 10 +
        obstacles.filter((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0).length
  const specs: Spec[] = []
  for (const it of items) {
    const w = Math.max(...it.lines.map((l) => textWidth(l.text, l.size, l.weight))) + 2
    const h = it.lines.reduce((a, l) => a + l.size + 3, 0)
    const gap = it.r + 5
    const options: { rect: Rect; align: CanvasTextAlign; x: number; top: number }[] = [
      { rect: { x0: it.x + gap, y0: it.y - h / 2, x1: it.x + gap + w, y1: it.y + h / 2 }, align: "left", x: it.x + gap, top: it.y - h / 2 },
      { rect: { x0: it.x - gap - w, y0: it.y - h / 2, x1: it.x - gap, y1: it.y + h / 2 }, align: "right", x: it.x - gap, top: it.y - h / 2 },
      { rect: { x0: it.x - w / 2, y0: it.y - gap - h, x1: it.x + w / 2, y1: it.y - gap }, align: "center", x: it.x, top: it.y - gap - h },
      { rect: { x0: it.x - w / 2, y0: it.y + gap, x1: it.x + w / 2, y1: it.y + gap + h }, align: "center", x: it.x, top: it.y + gap },
    ]
    const pick = options.reduce((best, o) => (cost(o.rect) < cost(best.rect) ? o : best))
    placed.push(pick.rect)
    let ty = pick.top
    it.lines.forEach((l, k) => {
      ty += (l.size + 3) / 2
      specs.push(txt(`${it.id}:${k}`, pick.x, ty, l.text, { align: pick.align, size: l.size, weight: l.weight, color: l.colour, halo: true, enterDelay: it.delay ?? 1500 }))
      ty += (l.size + 3) / 2
    })
  }
  return specs
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
  const { stall: iStall, precovid: iPre, now: LAST } = data.index
  const draw = t / LAST
  const hx = x(t)
  const heads: { id: string; y: number; value: number; name: string; colour: string; weight: number }[] = []
  const ukc = ukNow(c)

  // Colours don't change with time, so compute them once per sex.
  const cols = cached(`gcol:${sex}`, () => data.areas.map((a) => gapColour(value(a, c), ukc)))
  data.areas.forEach((a, i) => {
    const special = a.code === low || a.code === high
    const followed = a.code === c.follow
    const col = cols[i]
    if (stage === "pair" && !special && !followed) {
      // Each dot from the scatter flies to where its own line ends, then gives way to the line.
      const v = value(a, c)
      specs.push(path(`tr:${a.code}`, trails[i], { color: col, alpha: 0.1, width: 1, draw: 1, layer: 1, enterDelay: 900, dur: 1200 }))
      if (v !== null) specs.push(mark(`a:${a.code}`, x(LAST), y(v), 4, col, { alpha: 0, dur: 1300, delay: Math.abs(Math.sin(i * 5.1)) * 350, layer: 3 }))
      return
    }
    const tone = a.code === low ? BRICK : a.code === high ? TEAL : followed ? FOLLOW : col
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
    specs.push(txt("uk:pairlab", x(iStall), y(uk[iStall]) + 14, "UK", { align: "center", size: 10.5, weight: 600, color: INK_3, halo: true, alpha: clamp01(t - iStall) }))
  }

  // Covid and the earlier trend, extended. The band spans periods that include 2020 or 2021.
  if (stage === "covid") {
    const start = (p: string) => Number(p.slice(0, 4))
    const cv = [data.periods.findIndex((p) => start(p) + 2 >= 2020), data.periods.findLastIndex((p) => start(p) <= 2021)]
    specs.push(
      mark("covid", (x(cv[0]) + x(cv[1])) / 2, (y(dom[0]) + y(dom[1])) / 2, x(cv[1]) - x(cv[0]), INK, { h: y(dom[0]) - y(dom[1]), rad: 0, alpha: 0.05, layer: 0, enter: "fade", arc: 0 }),
      txt("covid:lab", (x(cv[0]) + x(cv[1])) / 2, y(dom[1]) - (c.narrow ? -12 : 12), "COVID-19", { align: "center", size: 10, caps: true, weight: 600 })
    )
    if (t >= LAST - 0.02) {
      // The missing years: between the extended 2001–13 trend and what happened.
      const area = cached(`short:${sex}:${bk(box)}`, () => {
        const top: number[] = []
        const back: number[] = []
        for (let i = iStall; i <= LAST; i += 1) {
          top.push(x(i), y(st.stall + st.pre * (i - iStall)))
          // Prepend so the actual line runs back from the latest period, closing the shape.
          back.unshift(x(i), y(uk[i]))
        }
        return Float64Array.from([...top, ...back])
      })
      specs.push(path("short:area", area, { area: true, color: BRICK, alpha: 0.2, layer: 4, enterDelay: 1200, dur: 1000 }))
      specs.push(
        line("trend", x(iStall), y(st.stall), x(LAST), y(st.trendNow), { dash: [5, 5], width: 1.75, enter: "draw", dur: 1400, layer: 5 }),
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
  // Each pace label shows once time has passed its stretch; in covid they give way to the trend line.
  const fade = stage === "covid" ? 0.4 * (1 - clamp01((t - LAST + 1) * 1.5)) : 1
  if (stage === "gains" || stage === "flat" || stage === "covid") paceAt(0, iStall, st.pre, "pace:pre", clamp01(t - iStall + 1) * (stage === "gains" ? 1 : stage === "flat" ? 0.4 : fade))
  if (stage === "flat" || stage === "covid") {
    paceAt(iStall, iPre, st.post, "pace:post", clamp01(t - iPre + 1) * (stage === "flat" ? 1 : fade))
    specs.push(
      line("stall:rule", x(iStall), y(dom[1]), x(iStall), y(dom[0]), { dash: [2, 4], alpha: 0.5, layer: 1 }),
      txt("stall:lab", x(iStall) + 6, y(dom[1]) - 12, "Gains slow", { size: 10, caps: true, weight: 600, color: INK })
    )
  }

  // Pair: the gap then and now.
  if (stage === "pair") {
    const P = pairOf(c).le
    const gapAt = (i: number) => (at(P.high, i) as number) - (at(P.low, i) as number)
    specs.push(
      line("pair:br0", x(0) + 10, y(P.high[0] as number) + 8, x(0) + 10, y(P.low[0] as number) - 8, { width: 1.25, enter: "draw", enterDelay: 900, layer: 6 }),
      txt("pair:br0:lab", x(0) + 18, (y(P.high[0] as number) + y(P.low[0] as number)) / 2, `${years(gapAt(0))} years`, { size: c.narrow ? 13 : 16, font: "display", color: INK, halo: true, layer: 9, enterDelay: 1000 }),
      // The moving bracket shows once it has pulled clear of the 2001–03 one.
      line("pair:brT", hx + 16, y(at(P.high, t) as number) + 8, hx + 16, y(at(P.low, t) as number) - 8, { width: 1.25, layer: 6, alpha: clamp01(t - 1.5) }),
      txt("pair:brT:lab", hx + 24, (y(at(P.high, t) as number) + y(at(P.low, t) as number)) / 2, "", {
        value: gapAt(t),
        format: (v) => `${years(v)} ${c.narrow ? "yrs" : "years"}`,
        size: c.narrow ? 14 : 18,
        font: "display",
        color: INK,
        halo: true,
        alpha: clamp01(t - 1.5),
      })
    )
  }

  for (const h of spread(heads, 17)) {
    specs.push(
      txt(h.id, hx + (stage === "pair" ? 14 : 12), h.y, "", {
        enterDelay: 900,
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
      txt(`pairname:${high}`, hx + 14, y(at(P.high, t) as number) - 18, "", {
        enterDelay: 900, value: at(P.high, t) as number, format: (v) => `${short(pairOf(c).high.name, c.narrow)} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: 600, color: TEAL, halo: true }),
      txt(`pairname:${low}`, hx + 14, y(at(P.low, t) as number) + 18, "", {
        enterDelay: 900, value: at(P.low, t) as number, format: (v) => `${short(pairOf(c).low.name, c.narrow)} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: 600, color: BRICK, halo: true })
    )
  }
  // Lines keep the map's colours: each place's gap to the UK in the latest period.
  if (stage !== "pair" && !c.narrow) specs.push(...legend(c, "gap", x(LAST) - 180, y(dom[0]) - 44, `Line colour: gap to UK, ${data.periods[LAST]}`, "line"))
  specs.push(ghostYear(c, x(0) + 6))
  return specs
}

// ——— Among peers ————————————————————————————————————————————————

/** Familiar comparators, named and coloured in every international scene; the other members stay faint. */
const FAMILIAR: Record<string, string> = {
  JPN: "#7b5ea7",
  ESP: "#c0692f",
  ITA: "#5b8c3a",
  FRA: "#3c6fb4",
  IRL: "#a09a2c",
  DEU: "#8a6e4b",
  CAN: "#c24f7a",
  USA: "#4d5561",
}
const countryStyle = (code: string) =>
  code === "GBR"
    ? { colour: INK, width: 3, alpha: 1, layer: 6, head: 12 }
    : FAMILIAR[code]
      ? { colour: FAMILIAR[code], width: 1.75, alpha: 0.9, layer: 4, head: 7 }
      : { colour: INK_4, width: 1, alpha: 0.35, layer: 2, head: 4.5 }

/** Countries drawn as lines: the UK and the named comparators. The rest live in the average and the table. */
const shown = (code: string) => code === "GBR" || Boolean(FAMILIAR[code])

function intlDomain(c: Ctx): [number, number] {
  return cached(`idom:${c.sex}`, () => {
    const v = c.data.intl.countries
      .filter((k) => shown(k.code))
      .flatMap((k) => k[c.sex])
      .concat(c.data.intl[c.sex].average)
      .filter((x): x is number => x !== null)
    return [Math.floor(Math.min(...v)) - 1, Math.ceil(Math.max(...v)) + 1]
  })
}

const flatPts = (values: (number | null)[], x: (i: number) => number, y: (v: number) => number) =>
  Float64Array.from(values.flatMap((v, i) => [x(i), v === null ? NaN : y(v)]))

/** The UK line among the other OECD members and their average, drawn with time. */
function peers(c: Ctx): Spec[] {
  const { intl } = c.data
  const { sex, box } = c
  const P = intl[sex]
  const n = intl.years.length
  const t = Math.min(c.t, n - 1)
  const x = scaleLinear().domain([0, n - 1]).range(timeRange(box, c.narrow))
  const dom = intlDomain(c)
  const y = scaleLinear().domain(dom).range([box.y + box.h - 30, box.y + 24])
  const specs: Spec[] = []
  const [y0] = y.range()
  for (const v of y.ticks(box.h < 380 ? 4 : 6)) {
    specs.push(line(`yg:${v}`, x(0) - 6, y(v), x(n - 1), y(v), { color: LINE, alpha: 0.9, layer: 0 }))
    specs.push(txt(`y:${v}`, x(0) - 12, y(v), String(v), { align: "right" }))
  }
  const marks = [2001, 2011, 2019, intl.years[n - 1]].filter((yr, i, a) => a.indexOf(yr) === i && (!c.narrow || yr !== 2019))
  for (const yr of marks) specs.push(txt(`yr:${yr}`, x(intl.years.indexOf(yr)), y0 + 20, String(yr), { align: "center" }))
  specs.push(txt(`yt:peers:${sex}`, x(0) - 12, box.y - 2, c.narrow ? `${who(sex)} · life expectancy` : `${who(sex)} · life expectancy at birth · UK, OECD average and eight members`, { size: 10, caps: true, weight: 600 }))
  const i2011 = intl.years.indexOf(2011)
  specs.push(
    line("peers:2011", x(i2011), y(dom[1]), x(i2011), y0, { dash: [2, 4], alpha: 0.5, layer: 1 }),
    txt("peers:2011:lab", x(i2011) + 6, y(dom[1]) - 12, "2011", { size: 10, caps: true, weight: 600, color: INK })
  )
  const pts = cached(`ipts:${sex}:${bk(box)}`, () => intl.countries.map((k) => flatPts(k[sex], x, y)))
  const avgPts = cached(`iavg:${sex}:${bk(box)}`, () => flatPts(P.average, x, y))
  const draw = t / (n - 1)
  const labels: { id: string; y: number; value: number; name: string; colour: string; weight: number }[] = []
  intl.countries.forEach((k, i) => {
    if (!shown(k.code)) return
    const uk = k.code === "GBR"
    const st = countryStyle(k.code)
    const v = at(k[sex], t)
    specs.push(path(`c:${k.code}`, pts[i], { color: st.colour, width: st.width, alpha: st.alpha, draw, layer: st.layer }))
    if (v === null) return
    specs.push(
      mark(uk ? "uk:head" : `ch:${k.code}`, x(t), y(v), st.head, st.colour, {
        hit: COUNTRY_HIT + i,
        stroke: uk || FAMILIAR[k.code] ? PAPER : undefined,
        strokeW: uk ? 2.5 : FAMILIAR[k.code] ? 1.25 : 0,
        alpha: uk || FAMILIAR[k.code] ? 1 : 0.7,
        layer: st.layer + 1,
        enterDelay: 400 + i * 12,
        dur: 1100,
      })
    )
    if (uk) labels.push({ id: "head:uk", y: y(v), value: v, name: "UK", colour: INK, weight: 700 })
    else if (FAMILIAR[k.code] && (!c.narrow || k.code === "JPN" || k.code === "USA")) labels.push({ id: `head:${k.code}`, y: y(v), value: v, name: k.name, colour: st.colour, weight: 600 })
  })
  // The UK's 359 places collapse into one figure: the column of dots folds into the UK's latest point, while the line rewinds to 2001.
  const ukSeries = intl.countries.find((k) => k.code === "GBR")![sex]
  const ukEnd = { x: x(n - 1), y: y(ukSeries[n - 1] ?? (ukSeries[n - 2] as number)) }
  const cols = cached(`gcol:${sex}`, () => c.data.areas.map((a) => gapColour(value(a, c), ukNow(c))))
  c.data.areas.forEach((a, i) =>
    specs.push(mark(`a:${a.code}`, ukEnd.x, ukEnd.y, 3, cols[i], { alpha: 0, dur: 1100, delay: Math.abs(Math.sin(i * 12.9)) * 200, layer: 6, arc: 0 }))
  )
  // The OECD average: an unweighted mean of members, dashed.
  const av = at(P.average, t) as number
  specs.push(
    path("oecd:avg", avgPts, { color: INK_3, width: 2, dash: [5, 4], draw, layer: 5 }),
    mark("oecd:head", x(t), y(av), 7, INK_3, { stroke: PAPER, strokeW: 1.5, layer: 6, enterDelay: 400, dur: 1100 })
  )
  labels.push({ id: "head:oecd", y: y(av), value: av, name: c.narrow ? "OECD" : "OECD average", colour: INK_3, weight: 600 })
  for (const l of spread(labels, 15, y0 - 6))
    specs.push(
      txt(l.id, x(t) + 12, l.y, "", { value: l.value, format: (v) => `${l.name} ${years(v)}`, size: c.narrow ? 11 : 12.5, weight: l.weight, color: l.colour, halo: true, enterDelay: 500 })
    )
  specs.push(ghostYear(c, x(0) + 6, intl.years.map(String)))
  return specs
}

/**
 * Where each member started in 2011 against what it gained by 2019. Countries that started lower
 * had more room to grow; the line is the least-squares fit, and the band holds members that
 * started within a year of the UK.
 */
function room(c: Ctx): Spec[] {
  const I = c.data.intl
  const { sex, box } = c
  const P = I[sex]
  const pts = P.start
  const left = box.x + (c.narrow ? 30 : 44)
  const right = box.x + box.w - (c.narrow ? 10 : 40)
  const top = box.y + 30
  const bottom = box.y + box.h - 40
  const xs = pts.map((d) => d.start)
  const ys = pts.map((d) => d.gain)
  const x = scaleLinear().domain([Math.min(...xs) - 0.5, Math.max(...xs) + 0.5]).nice().range([left, right])
  const y = scaleLinear().domain([Math.min(0, ...ys) - 0.2, Math.max(...ys) + 0.2]).nice().range([bottom, top])
  const specs: Spec[] = []
  for (const v of y.ticks(6)) {
    specs.push(line(`rm:yg:${v}`, left - 6, y(v), right, y(v), { color: LINE, alpha: v === 0 ? 0 : 0.9, layer: 0, enterDelay: TICK_WAIT }))
    specs.push(txt(`rm:y:${v}`, left - 12, y(v), v === 0 ? "0" : signed(v, 0), { align: "right", enterDelay: TICK_WAIT }))
  }
  for (const v of x.ticks(c.narrow ? 4 : 7)) specs.push(txt(`rm:x:${v}`, x(v), bottom + 20, String(v), { align: "center", enterDelay: TICK_WAIT }))
  specs.push(
    line("rm:zero", left - 6, y(0), right, y(0), { width: 1.25, alpha: 0.6, layer: 1, enter: "draw", enterDelay: 300 }),
    txt(`yt:room:${sex}`, left - 12, top - 26, c.narrow ? `${who(sex)} · gained 2011–19` : `${who(sex)} · years of life expectancy gained, 2011 to 2019`, { size: 10, caps: true, weight: 600 }),
    txt("rm:xt", right, bottom + 40, "Life expectancy in 2011, years →", { align: "right", size: 10.5 })
  )
  const uk = pts.find((d) => d.code === "GBR")!
  // The band of similar starting points.
  specs.push(
    mark("rm:band", x(uk.start), (top + bottom) / 2, x(uk.start + 1) - x(uk.start - 1), INK, { h: bottom - top, rad: 4, alpha: 0.05, layer: 0, arc: 0, enter: "fade", enterDelay: 900 }),
    txt("rm:bandlab", x(uk.start), top + 12, c.narrow ? "Within a year of the UK" : "Started within a year of the UK", { align: "center", size: 10, caps: true, weight: 600, enterDelay: 1000 })
  )
  // The fit across the observed range.
  const f = P.startFit
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  specs.push(line("rm:fit", x(x0), y(f.intercept + f.slope * x0), x(x1), y(f.intercept + f.slope * x1), { width: 2, alpha: 0.5, dash: [6, 4], layer: 2, enter: "draw", enterDelay: 1300, dur: 1000 }))
  if (!c.narrow)
    specs.push(
      txt("rm:fitlab", x(x0) + 6, y(f.intercept + f.slope * x0) - 14, "Average for each starting level", { size: 10.5, color: INK_3, halo: true, enterDelay: 2000 })
    )
  // The UK against the line.
  const expected = f.intercept + f.slope * uk.start
  specs.push(
    // A tick from the UK's dot up to the line: how far below the average for its starting level it gained.
    line("rm:short", x(uk.start), y(expected), x(uk.start), y(uk.gain) - 8, { width: 2, color: BRICK, layer: 7, enter: "draw", enterDelay: 2100, dur: 600 }),
    mark("rm:expected", x(uk.start), y(expected), 7, PAPER, { stroke: BRICK, strokeW: 1.75, layer: 7, enterDelay: 2000, arc: 0 })
  )
  // Countries: the same heads as the line charts, landing at their start and gain.
  const labels: Placeable[] = []
  const dots: Rect[] = []
  I.countries.forEach((k, i) => {
    const d = pts[i]
    const isUk = k.code === "GBR"
    const st = countryStyle(k.code)
    const px = x(d.start)
    const py = y(d.gain)
    const near = Math.abs(d.start - uk.start) <= 1
    specs.push(
      mark(isUk ? "uk:head" : `ch:${k.code}`, px, py, isUk ? 14 : FAMILIAR[k.code] ? 10 : 8, isUk ? INK : FAMILIAR[k.code] ? st.colour : near ? INK_3 : INK_4, {
        hit: COUNTRY_HIT + i,
        stroke: PAPER,
        strokeW: isUk ? 2.5 : 1.25,
        alpha: isUk || FAMILIAR[k.code] || near ? 1 : 0.75,
        layer: isUk ? 8 : 5,
        delay: ((px - left) / (right - left)) * 300,
        enterDelay: 300 + ((px - left) / (right - left)) * 600,
        dur: 1200,
      })
    )
    const rad = isUk ? 7 : FAMILIAR[k.code] ? 5 : 4
    dots.push({ x0: px - rad, y0: py - rad, x1: px + rad, y1: py + rad })
    if (isUk)
      labels.unshift({
        id: "rml:GBR",
        x: px,
        y: py,
        r: 7,
        delay: 2200,
        lines: [
          { text: `United Kingdom ${signed(d.gain)}`, size: c.narrow ? 11.5 : 12.5, weight: 700, colour: INK },
          { text: `${years(expected - d.gain)} below the line`, size: c.narrow ? 10.5 : 11.5, weight: 600, colour: BRICK },
        ],
      })
    else if (FAMILIAR[k.code] && !c.narrow) labels.push({ id: `rml:${k.code}`, x: px, y: py, r: 5, lines: [{ text: k.name, size: 11, weight: 600, colour: st.colour }] })
  })
  specs.push(...placeLabels(labels, dots, { x0: box.x - 30, y0: box.y, x1: c.W - 6, y1: box.y + box.h }))
  return specs
}

/** The same lines as ranks: 1 is the longest life expectancy that year. */
function rankChart(c: Ctx): Spec[] {
  const { intl } = c.data
  const { sex, box } = c
  const P = intl[sex]
  const n = intl.years.length
  const t = Math.min(c.t, n - 1)
  const count = intl.countries.length
  const x = scaleLinear().domain([0, n - 1]).range(timeRange(box, c.narrow))
  const y = scaleLinear().domain([1, count]).range([box.y + 16, box.y + box.h - 30])
  const [, y1] = y.range()
  const specs: Spec[] = []
  for (const r of [1, 10, 20, 30, count]) {
    specs.push(line(`rkg:${r}`, x(0) - 6, y(r), x(n - 1), y(r), { color: LINE, alpha: 0.9, layer: 0, enterDelay: TICK_WAIT }))
    specs.push(txt(`rk:${r}`, x(0) - 12, y(r), nth(r), { align: "right", enterDelay: TICK_WAIT }))
  }
  const marks = [2001, 2011, 2019, intl.years[n - 1]].filter((yr, i, a) => a.indexOf(yr) === i && (!c.narrow || yr !== 2019))
  for (const yr of marks) specs.push(txt(`yr:${yr}`, x(intl.years.indexOf(yr)), y1 + 20, String(yr), { align: "center" }))
  specs.push(txt(`yt:rank:${sex}`, x(0) - 12, box.y - 2, `${who(sex)} · rank among OECD countries · 1st = longest life`, { size: 10, caps: true, weight: 600 }))
  const i2011 = intl.years.indexOf(2011)
  specs.push(line("peers:2011", x(i2011), y(1) - 8, x(i2011), y1, { dash: [2, 4], alpha: 0.5, layer: 1 }))
  // Lines follow table position; labels give the competition rank, where ties share a place.
  const pts = cached(`rpts:${sex}:${bk(box)}`, () => P.order.map((r) => flatPts(r, x, y)))
  const rankLabel = (k: number, i: number) => {
    const r = P.ranks[k][i]
    if (r === null) return ""
    const tied = P.ranks.some((other, j) => j !== k && other[i] === r)
    return `${tied ? "=" : ""}${nth(r)}`
  }
  // Labels list every country when rows are tall enough to read, otherwise the named ones.
  const rowH = (y1 - y(1)) / (count - 1)
  const all = rowH >= 11 && !c.narrow
  const k = intl.countries.findIndex((cn) => cn.code === "GBR")
  intl.countries.forEach((cn, i) => {
    const uk = cn.code === "GBR"
    const st = countryStyle(cn.code)
    const r = at(P.order[i], t)
    specs.push(path(`c:${cn.code}`, pts[i], { color: st.colour, width: st.width + (uk ? 0.5 : 0), alpha: Math.max(st.alpha, 0.45), draw: 1, layer: st.layer, dur: 1300 }))
    if (r === null) return
    specs.push(
      mark(uk ? "uk:head" : `ch:${cn.code}`, x(t), y(r), Math.max(st.head, 6), st.colour, {
        hit: COUNTRY_HIT + i,
        stroke: uk || FAMILIAR[cn.code] ? PAPER : undefined,
        strokeW: uk ? 2.5 : FAMILIAR[cn.code] ? 1.25 : 0,
        layer: st.layer + 1,
        delay: (r / count) * 300,
        dur: 1300,
      })
    )
    // Each name carries its life expectancy, so a place in the table reads as years.
    const v = at(cn[sex], t)
    if (uk || (FAMILIAR[cn.code] && !c.narrow) || all)
      specs.push(
        txt(`rkl:${cn.code}`, x(t) + 12, y(r), "", {
          value: v ?? 0,
          format: (n) => (uk ? `${c.narrow ? "UK" : "United Kingdom"} ${rankLabel(i, Math.round(t))} · ${years(n)}` : `${cn.name} ${years(n)}`),
          size: uk ? 12 : Math.min(11, rowH * 0.85),
          weight: uk ? 700 : FAMILIAR[cn.code] ? 600 : 400,
          color: uk ? INK : FAMILIAR[cn.code] ? st.colour : INK_3,
          halo: true,
          enterDelay: 900,
        })
      )
  })
  // Where the UK stood in 2001 and 2011.
  for (const yr of [2001, 2011]) {
    const i = intl.years.indexOf(yr)
    const pos = P.order[k][i]
    if (pos === null) continue
    specs.push(
      mark(`rk:uk:${yr}`, x(i), y(pos), 9, PAPER, { stroke: INK, strokeW: 2, layer: 8, enterDelay: 1100 }),
      txt(`rk:uk:${yr}:lab`, x(i), y(pos) - 15, rankLabel(k, i), { align: "center", size: 12, weight: 700, color: INK, halo: true, enterDelay: 1200 })
    )
  }
  return specs
}

/**
 * The same lines, each slid up or down so it passes through zero in 2011: below zero is where a
 * country climbed from, above zero is what it has gained since.
 */
function pinned(c: Ctx): Spec[] {
  const { intl } = c.data
  const { sex, box } = c
  const P = intl[sex]
  const n = intl.years.length
  const t = Math.min(c.t, n - 1)
  const i11 = intl.years.indexOf(2011)
  const rel = (v: (number | null)[]) => {
    const base = v[i11] as number
    return v.map((x) => (x === null ? null : x - base))
  }
  const series = cached(`pin:${sex}`, () => ({ countries: intl.countries.map((k) => rel(k[sex])), avg: rel(P.average) }))
  const dom = cached(`pindom:${sex}`, () => {
    const v = intl.countries
      .flatMap((k, i) => (shown(k.code) ? series.countries[i] : []))
      .concat(series.avg)
      .filter((x): x is number => x !== null)
    return [Math.floor(Math.min(...v)) - 0.5, Math.ceil(Math.max(...v)) + 0.5] as [number, number]
  })
  const x = scaleLinear().domain([0, n - 1]).range(timeRange(box, c.narrow))
  const y = scaleLinear().domain(dom).range([box.y + box.h - 30, box.y + 24])
  const [y0, y1] = y.range()
  const specs: Spec[] = []
  for (const v of y.ticks(box.h < 380 ? 5 : 8)) {
    specs.push(line(`yg:pin:${v}`, x(0) - 6, y(v), x(n - 1), y(v), { color: LINE, alpha: v === 0 ? 0 : 0.9, layer: 0, enterDelay: TICK_WAIT }))
    specs.push(txt(`y:pin:${v}`, x(0) - 12, y(v), v === 0 ? (c.narrow ? "2011" : "2011 level") : signed(v, 0), { align: "right", enterDelay: TICK_WAIT, weight: v === 0 ? 700 : 400, color: v === 0 ? INK : INK_3 }))
  }
  const marks = [2001, 2011, 2019, intl.years[n - 1]].filter((yr, i, a) => a.indexOf(yr) === i && (!c.narrow || yr !== 2019))
  for (const yr of marks) specs.push(txt(`yr:${yr}`, x(intl.years.indexOf(yr)), y0 + 20, String(yr), { align: "center" }))
  specs.push(txt(`yt:pin:${sex}`, x(0) - 12, box.y - 2, `${who(sex)} · life expectancy against each country's 2011 level, years`, { size: 10, caps: true, weight: 600 }))
  // The pin: a zero line through 2011, and a shaded "before".
  specs.push(
    mark("pin:before", (x(0) + x(i11)) / 2, (y0 + y1) / 2, x(i11) - x(0), INK, { h: y0 - y1, rad: 0, alpha: 0.035, layer: 0, arc: 0, enter: "fade", enterDelay: 600 }),
    txt("pin:beforelab", x(i11) - 10, y1 + 14, "← Before 2011", { align: "right", size: 10, caps: true, weight: 600, enterDelay: 700 }),
    txt("pin:afterlab", x(i11) + 10, y1 + 14, "Since 2011 →", { size: 10, caps: true, weight: 600, enterDelay: 700 }),
    line("pin:zero", x(0), y(0), x(n - 1), y(0), { width: 1.25, alpha: 0.6, layer: 1, enter: "draw", enterDelay: 400 }),
    line("peers:2011", x(i11), y1, x(i11), y0, { dash: [2, 4], alpha: 0.5, layer: 1 }),
    mark("pin:dot", x(i11), y(0), 10, PAPER, { stroke: INK, strokeW: 2, layer: 9, enterDelay: 900, arc: 0 })
  )
  const pts = cached(`pinpts:${sex}:${bk(box)}`, () => ({
    countries: series.countries.map((v) => flatPts(v, x, y)),
    avg: flatPts(series.avg, x, y),
  }))
  const labels: { id: string; y: number; value: number; name: string; colour: string; weight: number }[] = []
  intl.countries.forEach((k, i) => {
    if (!shown(k.code)) return
    const uk = k.code === "GBR"
    const st = countryStyle(k.code)
    const v = at(series.countries[i], t)
    // Lines keep their ids from the previous chart, so each slides vertically into place.
    specs.push(path(`c:${k.code}`, pts.countries[i], { color: st.colour, width: st.width, alpha: st.alpha, draw: 1, layer: st.layer, dur: 1400, delay: i * 15 }))
    if (v === null) return
    specs.push(
      mark(uk ? "uk:head" : `ch:${k.code}`, x(t), y(v), st.head, st.colour, {
        hit: COUNTRY_HIT + i,
        stroke: PAPER,
        strokeW: uk ? 2.5 : 1.25,
        layer: st.layer + 1,
        dur: 1400,
        delay: i * 15,
      })
    )
    if (uk || !c.narrow) labels.push({ id: `pinl:${k.code}`, y: y(v), value: v, name: uk ? "UK" : k.name, colour: st.colour, weight: uk ? 700 : 600 })
  })
  const av = at(series.avg, t) as number
  specs.push(
    path("oecd:avg", pts.avg, { color: INK_3, width: 2, dash: [5, 4], draw: 1, layer: 5, dur: 1400 }),
    mark("oecd:head", x(t), y(av), 7, INK_3, { stroke: PAPER, strokeW: 1.5, layer: 6, dur: 1400 })
  )
  labels.push({ id: "pinl:oecd", y: y(av), value: av, name: c.narrow ? "OECD" : "OECD average", colour: INK_3, weight: 600 })
  for (const l of spread(labels, 15, y0 - 6))
    specs.push(
      txt(l.id, x(t) + 12, l.y, "", { value: l.value, format: (v) => `${l.name} ${signed(v)}`, size: c.narrow ? 11 : 12.5, weight: l.weight, color: l.colour, halo: true, enterDelay: 1100 })
    )
  return specs
}

// ——— III. The split ————————————————————————————————————————————————

function rowGeo(c: Ctx, count: number, o: { top?: number; right?: number; bottom?: number; labelW?: number } = {}) {
  const labelW = o.labelW ?? (c.narrow ? 34 : 128)
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

/** Marks the followed place's tenth: an accent dot by its row label and a note by the chart title. */
function followRowMark(c: Ctx, g: ReturnType<typeof rowGeo>, row: number | null): Spec[] {
  const a = c.follow ? c.data.areas.find((x) => x.code === c.follow) : null
  if (!a || row === null) return []
  return [
    mark("follow:rowdot", g.labelX - 10, g.y(row), 7, FOLLOW, { arc: 0, layer: 8, pulse: true, stroke: FOLLOW }),
    txt("follow:rownote", c.box.x + c.box.w, g.top - 38, `${a.name}: tenth ${row + 1}`, { align: "right", size: 11, weight: 600, color: FOLLOW }),
  ]
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
    const special = a.code === pairOf(c).low.code || a.code === pairOf(c).high.code
    specs.push(
      mark(`a:${a.code}`, p.x, p.y, special ? r * 2 + 2 : r * 2, fill, {
        hit: i,
        // Arriving from the OECD charts, the places burst back out of the UK's dot.
        enter: { from: "uk:head", w: 4 },
        enterDelay: 60 + (a.decile ?? 11) * 40 + Math.abs(Math.sin(i * 3.7)) * 200,
        alpha: eng || special ? 1 : 0.45,
        stroke: special ? INK : undefined,
        strokeW: special ? 1.5 : 0,
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
      line("zero", x(0), g.top - 12, x(0), g.bottom, { width: 1.25, layer: 2, enterDelay: 400, enter: "draw" }),
      txt("fell", x(0) - 8, g.top - 12, "← fell", { align: "right", size: 11.5, weight: 600, color: BRICK, enterDelay: 700 }),
      txt("rose", x(0) + 8, g.top - 12, "rose →", { size: 11.5, weight: 600, color: TEAL, enterDelay: 700 }),
      txt("avg:title", c.box.x + c.box.w, g.top - 12, c.narrow ? "Avg" : "Average", { align: "right", size: 10, caps: true, weight: 600 }),
      txt("xt:change", g.right, axisY + 20, `Change in ${who(sex).toLowerCase()}'s life expectancy since 2011–13, years →`, { align: "right", size: 10.5 })
    )
  }
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && pos[fi]) specs.push(...followSpecs(c, pos[fi], r, mode === "change" ? signed(change(data.areas[fi], c)) : years(value(data.areas[fi], c)), "right", undefined, 10))
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
      path(`decl:${d}`, lines[d], { color: col, width: edge ? 3 : d === followRow ? 2 : 1.25, alpha: edge || d === followRow ? 1 : 0.55, draw: t / data.index.now, layer: 2 }),
      mark(`dec:${d}`, hx, y(at(row, t) as number), edge ? 12 : 8, col, { stroke: PAPER, strokeW: 1.75, layer: 5, enterDelay: 500 + d * 40, dur: 900 })
    )
  })
  // Places gather as a faint cloud at the latest period, where their values are; the tenth lines draw towards them
  // and the cloud fades as they arrive.
  const last = data.index.now
  const [yb, yt] = y.range()
  data.areas.forEach((a) => {
    if (a.decile === null) return
    const v = value(a, c)
    if (v === null) return
    specs.push(
      mark(`a:${a.code}`, x(last), clamp(y(v), yt, yb), 4, decileColour(a.decile), {
        alpha: 0.4 * (1 - clamp01(t / last)),
        dur: 1200,
        delay: (a.decile - 1) * 35,
        layer: 1,
      })
    )
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
  for (const i of [0, data.index.stall]) {
    if (t < i + 0.6) continue
    const top = y(rows[9][i]) - 8
    const bottom = y(rows[0][i]) + 8
    specs.push(
      line(`dgap:${i}`, x(i), top, x(i), bottom, { width: 1, alpha: 0.6, dash: [2, 3], layer: 1, enter: "draw" }),
      txt(`dgap:${i}:lab`, i === 0 ? x(i) + 4 : x(i), top - 12, `${years(rows[9][i] - rows[0][i])} yrs`, { align: i === 0 ? "left" : "center", size: 11.5, weight: 600, color: INK, halo: true })
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

/**
 * Avoidable deaths per tenth as lollipops. The ring is the earlier rate; the dot slides from it to the
 * latest rate as time runs 0 → 1, trailing brick where the rate rose and teal where it fell.
 */
function avoidable(c: Ctx): Spec[] {
  const { data, sex } = c
  const rows = data.avoidable[sex]
  const t = clamp01(c.t)
  // Same rows as the healthy-years chart that follows, so the tenths hold still while the bars take over.
  const g = rowGeo(c, 10, { top: c.narrow ? 76 : 64, right: c.narrow ? 64 : 110, bottom: 44 })
  const top = Math.max(...rows.flatMap((r) => [r.then, r.now]))
  const x = scaleLinear().domain([0, top]).nice(5).range([g.left, g.right])
  // Small dots, so the brick or teal change trail between ring and dot stays visible.
  const dot = c.narrow ? 8 : 10
  const specs: Spec[] = []
  const followRow = followRowOf(c)
  rows.forEach((row, d) => {
    const y = g.y(d)
    const col = decileColour(d + 1)
    const v = row.then + (row.now - row.then) * t
    const rose = row.now > row.then
    const delay = d * 110
    specs.push(
      line(`avs:${d}`, x(0), y, x(v), y, { color: col, width: c.narrow ? 2 : 2.5, alpha: 0.4, layer: 1, enter: "draw", enterDelay: 500 + delay, dur: 900 }),
      mark(`avr:${d}`, x(row.then), y, dot + 4, "none", { stroke: INK_3, strokeW: 1.5, layer: 4, enterDelay: 900 + delay, dur: 500 }),
      line(`avl:${d}`, x(row.then), y, x(v), y, { color: rose ? BRICK : TEAL, width: 4, layer: 6, alpha: t > 0 ? 1 : 0 }),
      mark(`dec:${d}`, x(v), y, dot, col, { stroke: PAPER, strokeW: 1.5, layer: 5, delay, dur: 1200, arc: 0.12 }),
      txt(`cnt:${d}`, Math.max(x(v), x(row.then)) + dot, y, "", {
        value: v,
        format: (n) => String(Math.round(n)),
        size: c.narrow ? 11.5 : 12.5,
        weight: d === 0 || d === 9 ? 700 : 500,
        color: INK,
        enterDelay: 900 + delay,
      }),
      txt(`chg:${d}`, Math.max(x(v), x(row.then)) + dot + (c.narrow ? 26 : 32), y, signed(row.now - row.then, 0), {
        size: c.narrow ? 10.5 : 11.5,
        weight: 600,
        color: rose ? BRICK : TEAL,
        alpha: clamp01(t * 2 - 1),
      })
    )
  })
  // The most deprived tenth against the least, once the dots have landed.
  const ratio = rows[0].now / rows[9].now
  specs.push(
    txt("av:ratio", c.box.x + c.box.w, g.y(0), "", {
      value: ratio,
      format: (n) => `${n.toFixed(1)}×`,
      align: "right",
      size: c.narrow ? 17 : 24,
      font: "display",
      color: INK,
      enter: { value: 1 },
      enterDelay: 1800,
      dur: 900,
      alpha: c.narrow ? 0 : 1,
    }),
    txt("av:ratiolab", c.box.x + c.box.w, g.y(0) + 18, "the least deprived rate", { align: "right", size: 10, color: INK_3, enterDelay: 1800, alpha: c.narrow ? 0 : 1 })
  )
  specs.push(...rowLabels(c, g, 10, followRow), ...followRowMark(c, g, followRow))
  const axisY = g.bottom + 22
  specs.push(...xTicks("avx", x, x.ticks(c.narrow ? 4 : 5), axisY, { grid: [g.top - 8, g.bottom] }))
  specs.push(
    txt("avx:title", g.right, axisY + 20, "Deaths per 100,000 a year, age-standardised →", { align: "right", size: 10.5 }),
    txt(`av:title:${sex}`, g.labelX, g.top - 38, `${who(sex)} · avoidable deaths under 75 · by deprivation tenth`, { size: 10, caps: true, weight: 600 }),
    mark("av:k1", g.left + 6, g.top - 16, 12, "none", { stroke: INK_3, strokeW: 1.5, arc: 0, layer: 8 }),
    txt("av:k1t", g.left + 17, g.top - 16, data.avoidable.then, { size: 11, color: INK_2 }),
    mark("av:k2", g.left + 86, g.top - 16, 10, decileColour(3), { arc: 0, layer: 8 }),
    txt("av:k2t", g.left + 96, g.top - 16, data.avoidable.now, { size: 11, color: INK_2 })
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
      // Bars grow together, so no tenth looks healthiest just because it started first.
      // Bars linger as they leave, so the next scene's dots visibly split out of them.
      mark(`hb:${d}`, (x(0) + x(h)) / 2, y, x(h) - x(0), HEALTHY, { h: bh, rad: 3, arc: 0, enter: { x: x(0), w: 0, h: bh, alpha: 1 }, enterDelay: 400 + d * 12, dur: 1400, layer: 2, exit: "fade", exitDelay: 650 }),
      mark(`pb:${d}`, (x(h) + x(L)) / 2 + 1, y, Math.max(0, x(L) - x(h) - 2), POOR, { h: bh, rad: 3, hatch: true, arc: 0, enter: { x: x(h), w: 0, h: bh, alpha: 1 }, enterDelay: 1700 + d * 12, dur: 900, layer: 2 }),
      txt(`hbv:${d}`, x(h) - 8, y + 0.5, "", { value: h, format: (v) => years(v), align: "right", size: c.narrow ? 10.5 : 11.5, weight: 600, color: WHITE, enter: { x: x(0) - 8, value: 0, alpha: 1 }, enterDelay: 400 + d * 12, dur: 1400, layer: 9 }),
      txt(`pbv:${d}`, (x(h) + x(L)) / 2 + 1, y + 0.5, years(L - h), { align: "center", size: c.narrow ? 10 : 11, color: INK_2, enterDelay: 2300 + d * 12, layer: 9, alpha: x(L) - x(h) > 34 ? 1 : 0 }),
      txt(`life:${d}`, x(L) + 12, y + 0.5, years(L), { size: c.narrow ? 11 : 12, weight: 700, color: INK, enterDelay: 2400 + d * 12 }),
      // The lollipops become lifelines: the stick stretches to the whole lifespan under the bars and the dot rides to its end,
      // as in the opening scene.
      line(`avs:${d}`, x(0), y, x(L), y, { color: decileColour(d + 1), width: 2.5, alpha: 0, layer: 1, dur: 1200 }),
      mark(`dec:${d}`, x(L), y, c.narrow ? 9 : 11, decileColour(d + 1), { stroke: PAPER, strokeW: 2, layer: 6, delay: d * 25, dur: 1300, arc: 0 })
    )
  })
  // The healthy-years gap between the ends.
  const h0 = rows[0][sex].healthy
  const h9 = rows[9][sex].healthy
  const topY = g.top - 8
  specs.push(
    // Short ticks down to the first row's bar end and the last row's, joined by a bracket above.
    line("hg:0", x(h0), topY, x(h0), g.y(0) - bh / 2 - 2, { alpha: 0.7, enter: "draw", enterDelay: 2700, layer: 6 }),
    // The far tick runs down behind the bars to the least deprived row, whose healthy years it marks.
    line("hg:9", x(h9), topY, x(h9), g.y(9), { alpha: 0.7, dash: [2, 3], enter: "draw", enterDelay: 2700, layer: 1 }),
    line("hg:br", x(h0), topY, x(h9), topY, { width: 1.25, enter: "draw", enterDelay: 2900, layer: 6 }),
    txt("hg:lab", (x(h0) + x(h9)) / 2, topY - 14, "", { value: h9 - h0, format: (v) => `${years(v)} healthy years`, align: "center", size: c.narrow ? 13 : 16, font: "display", color: INK, halo: true, enter: { value: 0 }, enterDelay: 3000, dur: 900 }),
    ...followRowMark(c, g, followRow)
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
    const v = data.areas.filter((a) => a.nation === "E").map((a) => value(a, c)).filter((x): x is number => x !== null)
    return [Math.floor(Math.min(...v)) - 0.5, Math.ceil(Math.max(...v)) + 0.5] as [number, number]
  })
  const y = scaleLinear().domain(yd).range([bottom, top])
  const r = clamp(box.w / 150, 2.8, 5)
  const specs: Spec[] = []
  for (const v of y.ticks(5)) {
    specs.push(line(`yg:${v}`, left - 6, y(v), right, y(v), { color: LINE, alpha: 0.9, layer: 0, enterDelay: TICK_WAIT }))
    specs.push(txt(`y:${v}`, left - 12, y(v), String(v), { align: "right", enterDelay: TICK_WAIT }))
  }
  const fmt = (v: number) => (f.unit === "%" ? `${v}%` : String(v))
  for (const v of x.ticks(5)) {
    specs.push(txt(`f:${f.key}:${v}`, x(v), bottom + 20, fmt(v), { align: "center", enterDelay: TICK_WAIT }))
    specs.push(line(`fg:${f.key}:${v}`, x(v), top, x(v), bottom, { color: LINE, alpha: 0.6, layer: 0, enterDelay: TICK_WAIT }))
  }
  // Key for the deprivation colours, in the empty low-low corner.
  const keyX = left + 12
  const keyY = bottom - 16
  specs.push(txt("sc:key", keyX, keyY - 16, c.narrow ? "Deprivation tenth" : "Deprivation tenth of the area", { size: 10, color: INK_3, halo: true, enterDelay: 1600 }))
  for (let d = 1; d <= 10; d += 1) specs.push(mark(`sc:key:${d}`, keyX + (d - 1) * 11 + 4, keyY, 8, decileColour(d), { arc: 0, layer: 8, enterDelay: 1600 + d * 25 }))
  specs.push(
    txt("sc:key:lo", keyX, keyY + 14, "1 most", { size: 9.5, color: INK_3, halo: true, enterDelay: 1600 }),
    txt("sc:key:hi", keyX + 9 * 11 + 8, keyY + 14, "10 least", { size: 9.5, color: INK_3, halo: true, align: "right", enterDelay: 1600 })
  )
  specs.push(
    txt(`xt:${f.key}`, right, bottom + 40, `${f.label}, ${f.period} →`, { align: "right", size: 10.5 }),
    txt(`yt:sc:${sex}`, left - 12, top - 22, `${who(sex)} · life expectancy at birth`, { size: 10, caps: true, weight: 600 })
  )
  const { low, high } = pairCodes(c)
  const at = (i: number, d: number): Timing => ({ enterDelay: 150 + d * 50 + Math.abs(Math.sin(i)) * 400, delay: Math.abs(Math.sin(i * 7.3)) * 250, dur: 1250 })
  for (const { a, i } of eng) {
    if (a.decile === null) continue
    const special = a.code === low || a.code === high
    specs.push(
      mark(`a:${a.code}`, x(a.f[f.key] as number), y(value(a, c) as number), special ? r * 2 + 3 : r * 2, decileColour(a.decile as number), {
        hit: i,
        alpha: 0.92,
        stroke: special ? INK : PAPER,
        strokeW: special ? 1.5 : 0.6,
        enter: { from: `hb:${a.decile - 1}`, w: 3 },
        ...at(i, a.decile),
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
  // A small −1 to +1 scale beside r, so its sign and strength read at a glance; the marker slides between circumstances.
  if (!c.narrow) {
    const sx1 = right - 104
    const sx0 = sx1 - 120
    const sx = (v: number) => sx0 + ((v + 1) / 2) * (sx1 - sx0)
    const sy = top - 26
    specs.push(
      line("r:scale", sx0, sy, sx1, sy, { color: LINE, width: 2, layer: 7, enter: "draw", enterDelay: 1500 }),
      ...[-1, 0, 1].map((v) => line(`r:tick:${v}`, sx(v), sy - 4, sx(v), sy + 4, { color: INK_4, width: 1.25, layer: 7, enterDelay: 1500 })),
      txt("r:lo", sx(-1), sy + 13, "−1", { align: "center", size: 9.5, enterDelay: 1600 }),
      txt("r:mid", sx(0), sy + 13, "0 no link", { align: "center", size: 9.5, enterDelay: 1600 }),
      txt("r:hi", sx(1), sy + 13, "+1", { align: "center", size: 9.5, enterDelay: 1600 }),
      mark("r:dot", sx(fit.r), sy, 9, INK, { stroke: PAPER, strokeW: 1.5, layer: 8, arc: 0, enterDelay: 1600, dur: 900 })
    )
  }
  if (f.england !== null)
    specs.push(
      line("eng", x(f.england), top, x(f.england), bottom, { dash: [2, 3], alpha: 0.6, layer: 1 }),
      txt("eng:lab", x(f.england) + 5, bottom - 10, `England ${years(f.england, f.decimals)}${f.unit === "%" ? "%" : ""}`, { size: 10.5, color: INK_2, halo: true })
    )
  // Label the two places, where they have a figure (England only), riding with their dots.
  const fx = (a: Area) => (f.unit === "%" ? `${years(a.f[f.key])}%` : years(a.f[f.key], f.decimals))
  const placeAt = (i: number) => ({ x: x(data.areas[i].f[f.key] as number), y: y(value(data.areas[i], c) as number) })
  for (const [code, name, tone] of [
    [low, pairOf(c).low.name, BRICK],
    [high, pairOf(c).high.name, TEAL],
  ] as const) {
    const i = areaIndex(c, code)
    const a = data.areas[i]
    if (a.f[f.key] === null || a.decile === null) continue
    const p = placeAt(i)
    specs.push(...pill(`lab:${code}`, p, r + 1.5, name, fx(a), c, { side: p.x > (left + right) / 2 ? "left" : "right", lift: 14, tone, at: at(i, a.decile) }))
  }
  const fi = c.follow ? areaIndex(c, c.follow) : -1
  if (fi >= 0 && c.follow !== low && c.follow !== high && data.areas[fi].f[f.key] !== null && data.areas[fi].decile !== null) {
    specs.push(...followSpecs(c, placeAt(fi), r, fx(data.areas[fi]), "above", at(fi, data.areas[fi].decile as number)))
  }
  return specs
}

// ——— VI. Two places ———————————————————————————————————————————————

/** Short row labels for phones. */
const BRIEF: Record<string, string> = { childPoverty: "Child poverty", inactive: "Inactive adults", alcohol: "Alcohol admissions" }

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
      brief: "Healthy years",
      note: `years, ${data.hlePeriod}${P.hle.high === null ? `; not published for districts such as ${P.high.name}` : ""}`,
      low: P.hle.low,
      high: P.hle.high,
      england: P.hle.england,
      unit: "",
      stand: false,
    },
    { key: "av", label: `Avoidable deaths under 75, ${who(sex).toLowerCase()}`, brief: "Avoidable deaths", note: `per 100,000, ${data.avPeriods[last]}`, low: av.low[last], high: av.high[last], england: av.england[last], unit: "", stand: true },
    ...P.factors.map((f) => ({ key: f.key, label: f.label, brief: BRIEF[f.key] ?? f.label, note: `${f.unit === "%" ? "%" : f.unit}, ${f.period}`, low: f.low, high: f.high, england: f.england, unit: f.unit === "%" ? "%" : "", stand: true })),
  ]
  // Phones get one line per row: a short label, then the track, values above the dots, no notes.
  const compact = c.narrow
  const labelW = compact ? Math.min(118, box.w * 0.3) : 0
  const left = box.x + 4 + labelW
  const right = box.x + box.w - (compact ? 48 : 92)
  const rowH = box.h / rows.length
  const specs: Spec[] = []
  const { low, high } = pairCodes(c)
  rows.forEach((row, k) => {
    const top = box.y + rowH * k + (compact ? rowH / 2 : 14)
    const trackY = compact ? top : top + 54
    const max = Math.max(row.low ?? 0, row.high ?? 0, row.england ?? 0) * 1.12
    const x = scaleLinear().domain([0, max]).range([left, right])
    const delay = k * 160
    const digits = row.unit === "%" || row.key === "hle" ? 1 : 0
    specs.push(
      txt(`pw:${row.key}:label`, compact ? box.x : left, top, compact ? row.brief : row.label, { size: compact ? 11 : 14, weight: 600, color: INK, delay, enter: "rise" }),
      txt(`pw:${row.key}:note`, left, top + 18, row.note, { size: 11, color: INK_3, delay, enter: "rise", alpha: compact ? 0 : 1 }),
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
        txt(`pw:${row.key}:${d.side}:v`, x(d.v), trackY - (compact ? 14 : 18), `${d.stand && !compact ? `${d.stand.name} ` : ""}${years(d.v, digits)}${row.unit}`, {
          align: "center",
          size: compact ? 10.5 : 12.5,
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
        txt(
          `pw:${row.key}:vs`,
          box.x + box.w,
          trackY + (compact ? -15 : 20),
          row.high === null ? "vs England" : row.stand && sub.low && !compact ? `${short(sub.low.name, true)} vs ${short(P.high.name, true)}` : "",
          { align: "right", size: 10, color: INK_3, enterDelay: 1000 + delay }
        ),
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
  const kx = box.x + 4
  const lowName = short(P.low.name, compact)
  const highName = short(P.high.name, compact)
  const keyW = textWidth(lowName, 11.5, 600)
  specs.push(
    mark("pw:key:low", kx + 5, box.y - 16, 10, BRICK, { arc: 0, layer: 8 }),
    txt("pw:key:lowt", kx + 15, box.y - 16, lowName, { size: 11.5, weight: 600, color: INK }),
    mark("pw:key:high", kx + keyW + 32, box.y - 16, 10, TEAL, { arc: 0, layer: 8 }),
    txt("pw:key:hight", kx + keyW + 42, box.y - 16, highName, { size: 11.5, weight: 600, color: INK }),
    txt("pw:key:ratio", box.x + box.w, box.y - 16, compact ? "" : "Difference", { align: "right", size: 10, caps: true, weight: 600 }),
    ...(sub.low
      ? [
          mark("pw:key:stand", kx + keyW + 42 + textWidth(highName, 11.5, 600) + 24, box.y - 16, 10, "none", { stroke: BRICK, strokeW: 1.75, arc: 0, layer: 8 }),
          txt("pw:key:standt", kx + keyW + 52 + textWidth(highName, 11.5, 600) + 24, box.y - 16, compact ? sub.low.name : `${sub.low.name}, standing in`, { size: 11.5, color: INK_2 }),
        ]
      : [])
  )
  return specs
}

// ——— The film ——————————————————————————————————————————————————

export const CHAPTERS = ["The gap", "The stall", "Among peers", "The split", "Healthy years", "Circumstances", "Two places", "Your place"]

export const SCENES: SceneDef[] = [
  { id: "open", chapter: 0, build: open, aria: (c) => `Two lifelines: ${pairOf(c).high.name} and ${pairOf(c).low.name}, ten years apart` },
  { id: "swarm", chapter: 0, build: swarm, aria: () => "Every UK local authority on one life expectancy axis" },
  { id: "map", chapter: 0, build: (c) => map(c, "gap"), aria: () => "Hex map of UK local authorities coloured by gap to the UK average" },
  { id: "ends", chapter: 0, build: (c) => map(c, "ends"), aria: () => "Hex map with the ten highest and ten lowest places ringed" },
  { id: "rewind", chapter: 1, time: { from: 0, to: 0, ms: 0 }, build: (c) => stallChart(c, "rewind"), aria: () => "Every place in 2001–03, on a timeline" },
  { id: "gains", chapter: 1, time: { from: 0, to: "stall", ms: 4200, delay: 400 }, build: (c) => stallChart(c, "gains"), aria: () => "Life expectancy rising from 2001–03 to 2011–13" },
  { id: "flat", chapter: 1, time: { from: "stall", to: "precovid", ms: 3000, delay: 300 }, build: (c) => stallChart(c, "flat"), aria: () => "Life expectancy flattening from 2011–13 to 2017–19" },
  { id: "covid", chapter: 1, time: { from: "precovid", to: "now", ms: 3000, delay: 300 }, build: (c) => stallChart(c, "covid"), aria: () => "COVID-19 and the shortfall against the earlier trend" },
  { id: "peers", chapter: 2, time: { from: 0, to: "now", ms: 6000, delay: 500, axis: "years" }, build: peers, aria: () => "UK life expectancy among OECD countries, 2001 onwards" },
  { id: "pinned", chapter: 2, time: { from: "now", to: "now", ms: 0, axis: "years" }, build: pinned, aria: () => "Life expectancy against each country's 2011 level" },
  { id: "room", chapter: 2, build: room, aria: () => "Life expectancy in 2011 against the gain to 2019, OECD countries" },
  { id: "rank", chapter: 2, time: { from: "now", to: "now", ms: 0, axis: "years" }, build: rankChart, aria: () => "Rank of each OECD country by life expectancy, 2001 onwards" },
  { id: "tenths", chapter: 3, build: (c) => tenths(c, "level"), aria: () => "English local authorities in ten deprivation groups" },
  { id: "moved", chapter: 3, build: (c) => tenths(c, "change"), aria: () => "Change in life expectancy since 2011–13 by deprivation group" },
  { id: "widening", chapter: 3, time: { from: 0, to: "now", ms: 6500, delay: 600 }, build: widening, aria: () => "Mean life expectancy of each deprivation tenth over time" },
  { id: "avoidable", chapter: 3, time: { from: 0, to: 1, ms: 1800, delay: 2000, axis: "avoidable" }, build: avoidable, aria: () => "Avoidable deaths under 75 by deprivation tenth, then and now" },
  { id: "healthy", chapter: 4, build: healthy, aria: () => "Years in good health and not in good health by deprivation tenth" },
  { id: "poverty", chapter: 5, build: (c) => scatter({ ...c, factor: 0 }), aria: () => "Child poverty against life expectancy, English local authorities" },
  { id: "factors", chapter: 5, factors: true, build: scatter, aria: (c) => `${c.data.factors[c.factor]?.label ?? ""} against life expectancy` },
  { id: "pair", chapter: 6, time: { from: 0, to: "now", ms: 5500, delay: 1100 }, build: (c) => stallChart(c, "pair"), aria: (c) => `${pairOf(c).low.name} and ${pairOf(c).high.name} over time` },
  { id: "why", chapter: 6, build: pairWhy, aria: (c) => `${pairOf(c).low.name} and ${pairOf(c).high.name} compared` },
  { id: "close", chapter: 7, build: (c) => map(c, "change"), aria: () => "Hex map coloured by change in life expectancy since 2011–13" },
]
