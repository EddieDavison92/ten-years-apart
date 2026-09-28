/** Derives every figure the film shows from the raw ONS, OHID and hex files. Pure; no Node or Next imports. */

type Point = [number | null, number | null, number | null]
type Packed = {
  periods: string[]
  areas: { code: string; name: string; nation: string; grain: string }[]
  values: Record<string, Record<string, Record<string, Point[]>>>
}
type Indicator = {
  key: string
  group: string
  label: string
  short: string
  unit: string
  better: "low" | "high"
  decimals: number
  period: string
}
type Evidence = {
  meta: { fetched: string }
  indicators: Indicator[]
  england: Record<string, number>
  ltla: Record<string, Record<string, number>>
  utla: Record<string, Record<string, number>>
  flags?: Record<"ltla" | "utla", Record<string, string[]>>
}
type Hex = { hexes: Record<string, [number, number]> }

export type Raw = { le: Packed; hle: Packed; avoidable: Packed; evidence: Evidence; hex: Hex }
export type Sex = "male" | "female"
const SEXES = { male: "Male", female: "Female" } as const

const UK = "K02000001"
const ENGLAND = "E92000001"
const P_START = "2001 to 2003"
const P_STALL = "2011 to 2013"
const P_PRECOVID = "2017 to 2019"
/** Circumstances shown against life expectancy, in the order the film cycles them. */
const FACTORS = ["childPoverty", "smoking", "obesity", "inactive", "unemployment", "airPollution"]

export type Area = {
  code: string
  name: string
  nation: "E" | "W" | "S" | "N"
  q: number
  r: number
  male: (number | null)[]
  female: (number | null)[]
  /** IMD 2025 tenth among English local authorities, 1 = most deprived; null outside England. */
  decile: number | null
  /** Circumstance values keyed by factor, England only. */
  f: Record<string, number | null>
}

export type Factor = {
  key: string
  label: string
  short: string
  unit: string
  period: string
  decimals: number
  england: number | null
  fit: Record<Sex, { r: number; slope: number; intercept: number }>
}

export type FilmData = ReturnType<typeof computeFilm>

/** "2022 to 2024" -> "2022–24". */
export const compact = (p: string) => p.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")

const round = (v: number | null | undefined, d = 2) => (typeof v === "number" ? Math.round(v * 10 ** d) / 10 ** d : null)
const mean = (vs: (number | null | undefined)[]) => {
  const v = vs.filter((x): x is number => typeof x === "number")
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function linearFit(pts: { x: number; y: number }[]) {
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  const slope = sxy / sxx
  return { r: round(sxy / Math.sqrt(sxx * syy), 3) as number, slope, intercept: my - slope * mx }
}

/** IMD 2025 tenth per English area in a grain, ranked by score (1 = most deprived). */
function tenths(evidence: Evidence, grain: "ltla" | "utla", keep: (code: string) => boolean) {
  const scored = Object.entries(evidence[grain])
    .filter(([code, f]) => f.imd !== undefined && keep(code))
    .sort((a, b) => b[1].imd - a[1].imd)
  const out = new Map<string, number>()
  scored.forEach(([code], i) => out.set(code, Math.min(10, Math.floor((i * 10) / scored.length) + 1)))
  return out
}

export function computeFilm({ le, hle, avoidable, evidence, hex }: Raw) {
  const P = le.periods
  const index = { start: P.indexOf(P_START), stall: P.indexOf(P_STALL), precovid: P.indexOf(P_PRECOVID), now: P.length - 1 }
  const series = (file: Packed, code: string, sex: Sex, dim = "birth") =>
    (file.values[code]?.[SEXES[sex]]?.[dim] ?? []).map((p) => p[0])

  const decileOf = tenths(evidence, "ltla", (code) => Boolean(le.values[code]))
  const areas: Area[] = le.areas
    .filter((a) => a.grain === "ltla" && hex.hexes[a.code])
    .map((a) => ({
      code: a.code,
      name: a.name,
      nation: a.nation as Area["nation"],
      q: hex.hexes[a.code][0],
      r: hex.hexes[a.code][1],
      male: series(le, a.code, "male").map((v) => round(v, 1)),
      female: series(le, a.code, "female").map((v) => round(v, 1)),
      decile: decileOf.get(a.code) ?? null,
      f: Object.fromEntries(FACTORS.map((k) => [k, a.nation === "E" ? (evidence.ltla[a.code]?.[k] ?? null) : null])),
    }))

  const uk = { male: series(le, UK, "male") as number[], female: series(le, UK, "female") as number[] }

  const stall = (sex: Sex) => {
    const v = uk[sex]
    const pre = (v[index.stall] - v[index.start]) / (index.stall - index.start)
    const post = (v[index.precovid] - v[index.stall]) / (index.precovid - index.stall)
    const trendNow = v[index.stall] + pre * (index.now - index.stall)
    return {
      pre: round(pre, 3) as number,
      post: round(post, 3) as number,
      trendNow: round(trendNow, 2) as number,
      shortfall: round(trendNow - v[index.now], 2) as number,
      start: v[index.start],
      stall: v[index.stall],
      precovid: v[index.precovid],
      low: Math.min(...v.slice(index.precovid)),
      now: v[index.now],
    }
  }

  const ranked = (sex: Sex) =>
    areas.filter((a) => a[sex][index.now] !== null).sort((a, b) => (b[sex][index.now] as number) - (a[sex][index.now] as number))
  const ends = (sex: Sex) => {
    const list = ranked(sex)
    const pick = (a: Area) => ({ code: a.code, name: a.name, value: a[sex][index.now] as number })
    const values = list.map((a) => a[sex][index.now] as number).sort((a, b) => a - b)
    const q = (p: number) => values[Math.round(p * (values.length - 1))]
    return {
      top: pick(list[0]),
      bottom: pick(list[list.length - 1]),
      topTen: list.slice(0, 10).map((a) => a.code),
      bottomTen: list.slice(-10).map((a) => a.code),
      topTenEngland: list.slice(0, 10).filter((a) => a.nation === "E").length,
      bottomTenScotland: list.slice(-10).filter((a) => a.nation === "S").length,
      iqr: round(q(0.75) - q(0.25), 1) as number,
      median: q(0.5),
    }
  }

  // Places lower now than in 2011–13.
  const lower = (sex: Sex) =>
    areas.filter((a) => a[sex][index.now] !== null && a[sex][index.stall] !== null && (a[sex][index.now] as number) < (a[sex][index.stall] as number)).length

  const byDecile = (sex: Sex) =>
    Array.from({ length: 10 }, (_, d) => P.map((_, i) => round(mean(areas.filter((a) => a.decile === d + 1).map((a) => a[sex][i])), 2) as number))

  // Avoidable deaths under 75, mean of English areas in each tenth, per 100,000.
  const avThen = avoidable.periods.indexOf(P_STALL)
  const avNow = avoidable.periods.length - 1
  const avoidableByDecile = (sex: Sex) =>
    Array.from({ length: 10 }, (_, d) => {
      const codes = areas.filter((a) => a.decile === d + 1).map((a) => a.code)
      const at = (i: number) => round(mean(codes.map((c) => avoidable.values[c]?.[SEXES[sex]]?.avoidable?.[i]?.[0])), 1) as number
      return { then: at(avThen), now: at(avNow) }
    })

  // Healthy life expectancy is published for upper-tier areas; tenths are ranked at that grain.
  const hleI = hle.periods.length - 1
  const leForHle = P.indexOf(hle.periods[hleI])
  const utla = tenths(evidence, "utla", (code) => Boolean(hle.values[code]))
  const healthy = Array.from({ length: 10 }, (_, d) => {
    const codes = [...utla].filter(([, dec]) => dec === d + 1).map(([c]) => c)
    const pick = (file: Packed, sex: Sex, i: number) => round(mean(codes.map((c) => file.values[c]?.[SEXES[sex]]?.birth?.[i]?.[0])), 1) as number
    return {
      decile: d + 1,
      male: { healthy: pick(hle, "male", hleI), life: pick(le, "male", leForHle) },
      female: { healthy: pick(hle, "female", hleI), life: pick(le, "female", leForHle) },
    }
  })

  const ind = new Map(evidence.indicators.map((i) => [i.key, i]))
  const factors: Factor[] = FACTORS.map((key) => {
    const i = ind.get(key)!
    const fitFor = (sex: Sex) =>
      linearFit(
        areas
          .filter((a) => a.f[key] !== null && a[sex][index.now] !== null)
          .map((a) => ({ x: a.f[key] as number, y: a[sex][index.now] as number }))
      )
    return {
      key,
      label: i.label,
      short: i.short,
      unit: i.unit,
      period: i.period,
      decimals: i.decimals,
      england: evidence.england[key] ?? null,
      fit: { male: fitFor("male"), female: fitFor("female") },
    }
  })
  const imdFit = (sex: Sex) =>
    linearFit(
      areas
        .filter((a) => a.nation === "E" && evidence.ltla[a.code]?.imd !== undefined && a[sex][index.now] !== null)
        .map((a) => ({ x: evidence.ltla[a.code].imd, y: a[sex][index.now] as number }))
    ).r

  const imdRank = (() => {
    const order = Object.entries(evidence.ltla)
      .filter(([, f]) => f.imd !== undefined)
      .sort((a, b) => b[1].imd - a[1].imd)
      .map(([code]) => code)
    return (code: string) => ({ rank: order.indexOf(code) + 1, of: order.length })
  })()
  const factorAt = (code: string, key: string) => evidence.ltla[code]?.[key] ?? null

  /**
   * The lowest and highest places for one sex. Avoidable deaths (England and Wales) and OHID
   * measures (England) aren't published for Scotland or Northern Ireland, so for those the
   * lowest or highest English place stands in.
   */
  const pairFor = (sex: Sex) => {
    const e = ends(sex)
    const english = ranked(sex).filter((a) => a.nation === "E")
    const find = (code: string) => areas.find((a) => a.code === code)!
    const low = find(e.bottom.code)
    const high = find(e.top.code)
    const lowE = low.nation === "E" ? low : english[english.length - 1]
    const highE = high.nation === "E" ? high : english[0]
    const hleAt = (code: string) => hle.values[code]?.[SEXES[sex]]?.birth?.[hleI]?.[0] ?? null
    const av = (code: string) => series(avoidable, code, sex, "avoidable")
    const brief = (a: Area) => ({ code: a.code, name: a.name })
    return {
      low: { ...brief(low), value: e.bottom.value },
      high: { ...brief(high), value: e.top.value },
      standIn: { low: lowE === low ? null : brief(lowE), high: highE === high ? null : brief(highE) },
      le: { low: series(le, low.code, sex), high: series(le, high.code, sex) },
      hle: { low: hleAt(low.code), high: hleAt(high.code), england: hleAt(ENGLAND) },
      avoidable: { low: av(lowE.code), high: av(highE.code), england: av(ENGLAND) },
      /** Circumstances for everyone rather than by sex. */
      factors: ["childPoverty", "inactive", "alcohol"].map((key) => ({
        key,
        label: ind.get(key)!.label,
        unit: ind.get(key)!.unit,
        period: ind.get(key)!.period,
        low: factorAt(lowE.code, key),
        high: factorAt(highE.code, key),
        england: evidence.england[key] ?? null,
      })),
      imd: { low: imdRank(lowE.code), high: imdRank(highE.code) },
    }
  }

  // Air pollution: the 30 areas with the highest burden.
  const air = Object.entries(evidence.ltla)
    .filter(([, f]) => f.airPollution !== undefined)
    .sort((a, b) => b[1].airPollution - a[1].airPollution)
    .slice(0, 30)

  return {
    periods: P.map(compact),
    index,
    areas,
    uk,
    stall: { male: stall("male"), female: stall("female") },
    extremes: { male: ends("male"), female: ends("female") },
    lower: { male: lower("male"), female: lower("female") },
    deciles: { male: byDecile("male"), female: byDecile("female") },
    englandAreas: areas.filter((a) => a.decile !== null).length,
    avoidable: {
      then: compact(avoidable.periods[avThen]),
      now: compact(avoidable.periods[avNow]),
      male: avoidableByDecile("male"),
      female: avoidableByDecile("female"),
    },
    healthy: { period: compact(hle.periods[hleI]), rows: healthy },
    factors,
    imdR: { male: imdFit("male"), female: imdFit("female") },
    air: {
      london: air.filter(([code]) => code.startsWith("E09")).length,
      maleMean: round(mean(air.map(([code]) => le.values[code]?.Male?.birth?.[index.now]?.[0])), 1) as number,
      englandMale: le.values[ENGLAND]?.Male?.birth?.[index.now]?.[0] as number,
    },
    pairs: { male: pairFor("male"), female: pairFor("female") },
    hlePeriod: compact(hle.periods[hleI]),
    avPeriods: avoidable.periods.map(compact),
    fetched: evidence.meta.fetched,
  }
}
