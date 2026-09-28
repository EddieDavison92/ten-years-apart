import type { ReactNode } from "react"
import type { FilmData, Sex } from "@/lib/compute"
import { capital, months, nth, ordinal, signed, words, years } from "@/lib/format"

export type CopyCtx = { data: FilmData; sex: Sex; factor: number }

type Copy = { title: string; body: ReactNode; note?: ReactNode; stat?: { value: string; label: string } }

const WHO = {
  male: { plural: "men", adj: "male", child: "boy" },
  female: { plural: "women", adj: "female", child: "girl" },
} as const

const other = (s: Sex): Sex => (s === "male" ? "female" : "male")
/** Changes under this many years read as "barely moved": about five weeks, below the data's precision. */
const NOISE = 0.1
/** Falls of at least six months count as going backwards on the closing map; single-area estimates carry about ±0.6 years. */
const REAL_FALL = 0.5

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`)
/** Months, in words up to ten. */
const monthsWord = (y: number) => {
  const m = Math.round(Math.abs(y) * 12)
  return `${m <= 10 ? words(m) : m} month${m === 1 ? "" : "s"}`
}

/** How the ten tenths moved, most deprived first, with sizes; changes inside NOISE count as barely moved. */
function split(moves: number[]) {
  let fell = 0
  while (fell < 10 && moves[fell] <= -NOISE) fell += 1
  let flat = 0
  while (fell + flat < 10 && Math.abs(moves[fell + flat]) < NOISE) flat += 1
  const tail = moves.slice(fell + flat)
  if (fell === 0 || tail.some((m) => m < 0)) return `${capital(words(moves.filter((m) => m <= -NOISE).length))} of the ten tenths fell by more than a month.`
  const avgFell = moves.slice(0, fell).reduce((a, b) => a + b, 0) / fell
  const lead = fell === 1 ? `The most deprived tenth fell by about ${monthsWord(avgFell)}` : `On average the ${words(fell)} most deprived tenths fell by about ${monthsWord(avgFell)}`
  const mid = flat === 0 ? "" : flat === 1 ? " and the next barely moved" : ` and the next ${words(flat)} barely moved`
  return `${lead}${mid}; the least deprived gained ${monthsWord(moves[9])}.`
}

/** Which tenths' avoidable death rates rose, most deprived first. */
function avTrend(rows: { then: number; now: number }[]) {
  const rose = rows.map((r) => r.now > r.then)
  const k = rose.indexOf(false)
  const lead = k === -1 ? 10 : k
  return lead > 0 && rose.slice(lead).every((r) => !r)
    ? `risen in the ${lead === 1 ? "most deprived tenth" : `${words(lead)} most deprived tenths`} and fallen in the other ${words(10 - lead)}`
    : `risen in ${words(rose.filter(Boolean).length)} of the ten tenths`
}

/** "edged up" for small rises, under 5% of the earlier rate. */
function avTrendSized(rows: { then: number; now: number }[]) {
  const most = Math.max(...rows.map((r) => (r.now - r.then) / r.then))
  return most < 0.05 ? avTrend(rows).replace("risen", "edged up") : avTrend(rows)
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>

export function copyFor(id: string, { data, sex, factor }: CopyCtx): Copy {
  const w = WHO[sex]
  const o = other(sex)
  const { index, extremes, stall } = data
  const pair = data.pairs[sex]
  const pairGap = (s: Sex) => data.pairs[s].high.value - data.pairs[s].low.value
  const ext = extremes[sex]
  const rows = data.deciles[sex]
  const change = (r: number[]) => r[index.now] - r[index.stall]
  const P = data.periods

  switch (id) {
    case "open":
      return {
        title: `${capital(words(Math.round(pairGap(sex))))} years apart`,
        body: (
          <>
            A {w.child} born in <B>{pair.high.name}</B> can expect to live about {words(Math.round(pairGap(sex)))} years longer than one
            born in <B>{pair.low.name}</B>, if {P[index.now]} death rates held throughout their lives. This is where that gap lies, how
            progress stalled, and where it went into reverse.
          </>
        ),
        note: (
          <>
            For {WHO[o].plural} the widest gap is {years(pairGap(o))} years, between {data.pairs[o].high.name} and {data.pairs[o].low.name}.
          </>
        ),
      }
    case "swarm":
      return {
        title: `${data.areas.length} places, one line`,
        body: (
          <>
            Each dot is a UK local authority, placed by how long its {w.plural} can expect to live. Most crowd the middle: the middle half
            span just {years(ext.iqr)} years. The tails reach from {years(ext.bottom.value)} years in {ext.bottom.name} to{" "}
            {years(ext.top.value)} in {ext.top.name}.
          </>
        ),
        note: (
          <>
            ONS publishes no local figure for the City of London or the Isles of Scilly, so they&apos;re left out. For {WHO[o].plural} the
            range runs from {extremes[o].bottom.name} ({years(extremes[o].bottom.value)}) to {extremes[o].top.name} (
            {years(extremes[o].top.value)}).
          </>
        ),
      }
    case "map":
      return {
        title: "Every dot is a place",
        body: (
          <>
            The same dots, set roughly where each place sits on the map. <span className="font-semibold text-brick">Brick</span> is
            shorter than the UK figure of {years(stall[sex].now)} years, <span className="font-semibold text-teal">teal</span> longer.
          </>
        ),
        note: "Hover or tap any dot for its figures.",
      }
    case "ends": {
      const n = ext.bottomTen.length
      const tie = n > 10 ? ` (${words(n - 9)} tie for tenth)` : ""
      return {
        title: "The two ends",
        body: (
          <>
            Ringed: the highest and lowest for {w.plural}.{" "}
            {ext.topTenEngland === ext.topTen.length ? `All ${words(ext.topTen.length)}` : capital(words(ext.topTenEngland))} of the highest
            are in England. Scotland has {data.nations.S} of the {data.areas.length} areas but {words(ext.bottomTenScotland)} of the{" "}
            {words(n)} lowest{tie}.
          </>
        ),
      }
    }
    case "rewind":
      return {
        title: "Back to 2001",
        body: (
          <>
            Stand the dots on a timeline and wind back to {P[0]}. Each dot is still a place; the black dot is the UK, where {w.plural} could
            then expect {years(stall[sex].start)} years.
          </>
        ),
      }
    case "gains": {
      const up = data.areas.filter((a) => (a[sex][index.stall] ?? 0) > (a[sex][index.start] ?? Infinity)).length
      return {
        title: "A decade of gains",
        body: (
          <>
            From {P[0]} to {P[index.stall]}, UK life expectancy rose by about {months(stall.male.pre)} months a year for men and{" "}
            {months(stall.female.pre)} for women. {up === data.areas.length ? "Every place" : `${up} of ${data.areas.length} places`} moved
            up.
          </>
        ),
        note: "Each point is a three-year average, so 2011–13 means deaths in 2011, 2012 and 2013.",
      }
    }
    case "flat": {
      const both = months(stall.male.post) < 1 && months(stall.female.post) < 1
      return {
        title: "Then it flattened",
        body: (
          <>
            Between {P[index.stall]} and {P[index.precovid]} the gains shrank to{" "}
            {both
              ? "under a month a year for both men and women"
              : `${months(stall.male.post)} months a year for men and ${months(stall.female.post)} for women`}
            . The slowdown began years before the pandemic.
          </>
        ),
      }
    }
    case "covid": {
      const s = stall[sex]
      return {
        title: "COVID and after",
        body: (
          <>
            COVID-19 pushed life expectancy down. By {P[index.now]} {w.plural} were at {years(s.now)} years,{" "}
            {s.now < s.precovid ? "still below" : "back to"} their {P[index.precovid]} level of {years(s.precovid)}. Had the 2001–13 pace
            continued, they would be at about {years(s.trendNow)}. {years(s.shortfallPre)} years of that shortfall had opened before the
            pandemic.
          </>
        ),
        note: `The dashed line extends the earlier trend. It is not a forecast. ${P[index.now]} still includes 2022, when deaths were high.`,
        stat: { value: years(s.shortfall), label: `years below the earlier trend, ${w.plural}` },
      }
    }
    case "peers": {
      const I = data.intl
      const uk = I.countries.find((k) => k.code === "GBR")![sex]
      const avg = I[sex].average
      const lead = (y: number) => (uk[I.years.indexOf(y)] as number) - avg[I.years.indexOf(y)]
      const last = I.years[I.years.length - 1]
      const vs = (d: number) => `${years(Math.abs(d))} years ${d >= 0 ? "longer than" : "less than"}`
      return {
        title: "Falling back",
        body: (
          <>
            Was the stall only British? Here is the UK beside eight other OECD members and the average of all {I.countries.length}. In
            2011 UK {w.plural} could expect to live {vs(lead(2011))} the OECD average; by {last}, <B>{vs(lead(last)).replace(" than", "")}</B>.
          </>
        ),
        note: "OECD Health Statistics, single calendar years. The average is the unweighted mean of members, with Latvia's 2001 and Türkiye's 2024 filled from their nearest year. UK figures differ slightly from the ONS three-year estimates used elsewhere.",
      }
    }
    case "rank": {
      const I = data.intl
      const k = I.countries.findIndex((c) => c.code === "GBR")
      const R = I[sex].ranks[k]
      const last = I.years.length - 1
      const lastYear = I.years[last]
      const place = (i: number) => {
        const r = R[i] as number
        const tied = I[sex].ranks.some((o, j) => j !== k && o[i] === r)
        return `${tied ? "joint " : ""}${nth(r)}`
      }
      const ukNow = I.countries[k][sex][last] as number
      const near = I.countries.filter((c, j) => j !== k && c[sex][last] !== null && Math.abs((c[sex][last] as number) - ukNow) <= 0.5).length
      return {
        title: "Down the table",
        body: (
          <>
            Now all {I.countries.length} members, ranked each year with the longest life expectancy at the top; each name shows its{" "}
            {lastYear} figure. UK {w.plural} were {place(I.years.indexOf(2001))} in 2001 and {place(I.years.indexOf(2011))} in 2011. By{" "}
            {lastYear} they were <B>{place(last)} of {I[sex].reporting[last]}</B>.
          </>
        ),
        note: `In ${lastYear}, ${words(near)} countries were within six months of the UK, so small differences move it several places. The gap to the average is the steadier measure.`,
      }
    }
    case "pinned": {
      const I = data.intl
      const Y = I.years
      const i11 = Y.indexOf(2011)
      const i19 = Y.indexOf(2019)
      const last = Y.length - 1
      const gain = (v: (number | null)[], i: number) => (v[i] ?? v[i - 1] ?? 0) - (v[i11] as number)
      const ukv = I.countries.find((k) => k.code === "GBR")![sex]
      const g19 = gain(ukv, i19)
      const gL = gain(ukv, last)
      const avg = I[sex].average
      const names = new Map(I.countries.map((k) => [k.code, k.name]))
      // Members that gained less than the UK by 2019, before COVID-19; changes within 0.05 years count as equal.
      const less = I.countries.filter((k) => k.code !== "GBR" && gain(k[sex], i19) < g19 - 0.05).map((k) => names.get(k.code) ?? k.code)
      return {
        title: "Since 2011",
        body: (
          <>
            Slide every line so it passes through zero in 2011. To the left, each country climbs to its 2011 level; to the right is what
            it has gained since. By 2019 UK {w.plural} had gained <B>{years(g19)} years</B>, against {years(avg[i19] - avg[i11])} for the OECD
            average; {less.length === 0 ? "no member gained less" : `only ${list(less)} gained less`}. By {Y[last]} the UK was{" "}
            {years(Math.abs(gL))} years {gL >= 0 ? "above" : "below"} its 2011 level.
          </>
        ),
        note: "2019 is the last year before COVID-19. Single calendar years from OECD Health Statistics.",
      }
    }
    case "tenths":
      return {
        title: "Ten steps down",
        body: (
          <>
            Back home, the stall wasn&apos;t shared equally. These are England&apos;s {data.englandAreas} local authorities, in ten groups of
            29 or 30 by deprivation score (IMD 2025). Black ticks mark each group&apos;s average: {years(rows[0][index.now])} years for{" "}
            {w.plural} in the most deprived tenth, {years(rows[9][index.now])} in the least.
          </>
        ),
        note: "Wales, Scotland and Northern Ireland use different indices, so they sit apart. The deprivation measures that follow can't explain Scotland's position.",
      }
    case "moved":
      return {
        title: "Moving apart",
        body: (
          <>
            The same dots, now placed by how much {w.adj} life expectancy changed between {P[index.stall]} and {P[index.now]}.{" "}
            {split(rows.map(change))}
          </>
        ),
        note: "Places keep their 2025 deprivation group throughout.",
      }
    case "widening": {
      const g = data.deciles[sex][9].map((v, i) => v - data.deciles[sex][0][i])
      const peak = g.indexOf(Math.max(...g.slice(index.stall)))
      return {
        title: "Parting ways",
        body: (
          <>
            Averaged, each tenth becomes one line. For a decade the most and least deprived rose side by side, about {years(g[index.stall])}{" "}
            years apart. After {P[index.stall]} they parted:{" "}
            {peak === index.now ? (
              <>
                by {P[index.now]} the gap was <B>{years(g[index.now])} years</B>.
              </>
            ) : (
              <>
                the gap peaked at {years(g[peak])} years in {P[peak]} and was <B>{years(g[index.now])}</B> in {P[index.now]}.
              </>
            )}
          </>
        ),
        note: "Unweighted averages of local authorities. Each mixes richer and poorer neighbourhoods, so ONS figures by neighbourhood show a wider gap.",
      }
    }
    case "avoidable": {
      const av = data.avoidable[sex]
      const ratio = av[0].now / av[9].now
      return {
        title: "Deaths before 75",
        body: (
          <>
            ONS counts a death under 75 as avoidable if its cause could mostly be prevented by public health measures or treated by timely
            healthcare. In {data.avoidable.now} the most deprived tenth averaged {Math.round(av[0].now)} such deaths per 100,000 {w.plural} a
            year, {ratio >= 1.95 && ratio < 2.05 ? "twice" : `${ratio.toFixed(1)} times`} the rate in the least deprived. Since{" "}
            {data.avoidable.then} the rate has {avTrendSized(av)}, so the gap between the ends widened from {Math.round(av[0].then - av[9].then)} to{" "}
            {Math.round(av[0].now - av[9].now)} per 100,000.
          </>
        ),
        note: "Age-standardised rates. Since 2020 COVID-19 deaths count as preventable, which adds to the recent figures.",
      }
    }
    case "healthy": {
      const r = data.healthy.rows
      const h0 = r[0][sex]
      const h9 = r[9][sex]
      const k = (h9.healthy - h0.healthy) / (h9.life - h0.life)
      return {
        title: "The years in between",
        body: (
          <>
            Early deaths are one measure; years in good health are another. Healthy life expectancy estimates the years lived in self-rated
            good or very good health. {capital(w.plural)} in the least deprived tenth of areas can expect{" "}
            <B>{years(h9.healthy - h0.healthy)} more healthy years</B> than those in the most deprived,{" "}
            {k >= 2 ? "more than twice" : `${k.toFixed(1)} times`} the {years(h9.life - h0.life)}-year gap in lifespan.
          </>
        ),
        note: "Published for upper-tier areas in England, so the groups differ slightly from earlier. ONS labels it official statistics in development; its survey changed during the pandemic.",
      }
    }
    case "poverty": {
      const f = data.factors[0]
      const kids = Math.abs(f.fit[sex].r)
      const imd = Math.abs(data.imdR[sex])
      const how = kids > imd + 0.02 ? "more closely than" : kids > imd - 0.02 ? "about as closely as" : "nearly as closely as"
      return {
        title: "What travels with it",
        body: (
          <>
            Back to places, England only. Life expectancy lines up closely with child poverty (r = {signed(f.fit[sex].r, 2)}), {how} with
            the deprivation score ({signed(data.imdR[sex], 2)}). That score counts early deaths, so part of its link is built in; child
            poverty has no health component.
          </>
        ),
        note: "Correlations between areas. They don't show cause and say nothing about any individual. Child poverty here is absolute low income before housing costs, which understates London.",
      }
    }
    case "factors": {
      const f = data.factors[factor] ?? data.factors[1]
      const A = data.air
      const r = f.fit[sex].r
      const kids = data.factors[0].fit[sex].r
      // Strength words for |r|: 0.8+ closely, 0.5+ clearly, 0.3+ loosely, below that weakly.
      const strength = Math.abs(r) >= 0.8 ? "closely" : Math.abs(r) >= 0.5 ? "clearly" : Math.abs(r) >= 0.3 ? "loosely" : "weakly"
      const verb = /s$/.test(f.short) ? "line" : "lines"
      if (f.key === "airPollution")
        return {
          title: "Not everything lines up",
          body: (
            <>
              Air pollution barely lines up with life expectancy (r = {signed(r, 2)}). The 30 areas where it accounts for the largest share of
              deaths are {A.london === 30 ? "all" : `${A.london} of them`} in London; the {A.withLe} with a figure average {years(A[sex])} years for{" "}
              {w.plural}, against {years(A.england[sex])} for England.
            </>
          ),
          note: "A weak link between areas doesn't show air pollution is harmless; London's other advantages can mask it.",
        }
      if (f.key === "imd")
        return {
          title: "And the rest",
          body: (
            <>
              The deprivation score lines up {strength} with life expectancy (r = {signed(r, 2)}), partly by construction: it counts early
              deaths.
            </>
          ),
          note: "Pick any circumstance to see how the same places spread out.",
        }
      return {
        title: "And the rest",
        body: (
          <>
            {f.short} {verb} up {strength} with shorter lives (r = {signed(r, 2)}){Math.abs(r) < Math.abs(kids) ? ", less tightly than child poverty" : ""}.
            These circumstances overlap, so their links can&apos;t simply be added up.
          </>
        ),
        note: "Pick any circumstance to see how the same places spread out.",
      }
    }
    case "pair": {
      const le = pair.le
      const at = (v: (number | null)[], i: number) => v[i] as number
      const g0 = at(le.high, 0) - at(le.low, 0)
      const gN = at(le.high, index.now) - at(le.low, index.now)
      const lowSince = at(le.low, index.now) - at(le.low, index.stall)
      const lowTotal = at(le.low, index.now) - at(le.low, 0)
      return {
        title: `${pair.low.name} and ${pair.high.name}`,
        body: (
          <>
            Back to the two places we started with. {pair.high.name} has gained {years(at(le.high, index.now) - at(le.high, 0))} years since{" "}
            {P[0]}. {pair.low.name} gained {years(lowTotal)},{" "}
            {lowSince < -0.05
              ? `but is ${years(-lowSince)} lower than in ${P[index.stall]}`
              : `only ${years(Math.max(0, lowSince))} of it since ${P[index.stall]}`}
            . The gap has {gN >= g0 ? "widened" : "narrowed"} from {years(g0)} to <B>{years(gN)}</B> years.
          </>
        ),
        note: "These two were picked as today's extremes, so some of the widening comes from that choice.",
      }
    }
    case "why": {
      const av = pair.avoidable
      const last = av.low.length - 1
      const kids = pair.factors.find((f) => f.key === "childPoverty")!
      const lowE = pair.standIn.low?.name ?? pair.low.name
      const highE = pair.standIn.high?.name ?? pair.high.name
      const rank = (r: { rank: number; of: number }) =>
        r.rank === 1
          ? "is England's most deprived local authority"
          : r.rank === r.of
            ? "is the least deprived"
            : `is only the ${ordinal(r.rank)} most deprived of ${r.of}`
      const middling = pair.imd.high.rank < pair.imd.high.of * 0.7
      const ci = (c: number[] | null) => (c ? ` (${years(c[0])}–${years(c[1])})` : "")
      return {
        title: "What differs",
        body: (
          <>
            {pair.hle.low !== null && pair.hle.high !== null ? (
              <>
                {capital(w.plural)} in {pair.low.name} can expect {years(pair.hle.low)} years in good health,{" "}
                {years(pair.hle.high - pair.hle.low)} fewer than in {pair.high.name}.{" "}
              </>
            ) : pair.hle.low !== null && pair.hle.england !== null ? (
              <>
                {capital(w.plural)} in {pair.low.name} can expect {years(pair.hle.low)} years in good health, against {years(pair.hle.england)}{" "}
                for England.{" "}
              </>
            ) : null}
            In {lowE}, {w.plural} die from avoidable causes at {((av.low[last] as number) / (av.high[last] as number)).toFixed(1)} times the
            rate in {highE}, and {years(kids.low)}% of children live in low-income families, against {years(kids.high)}% in {highE}. On the
            2025 index {lowE} {rank(pair.imd.low)}; {highE} {rank(pair.imd.high)}.
            {middling ? " The link holds across places, not for every place." : ""}
          </>
        ),
        note: (
          <>
            {pair.standIn.low
              ? `${pair.low.name} is in Scotland. The avoidable-death figures here cover England and Wales, and the other measures England only, so ${pair.standIn.low.name}, England's lowest for ${w.plural}, stands in (hollow dots). `
              : ""}
            Healthy life expectancy for one area is uncertain by several years: {pair.low.name}
            {ci(pair.hle.lowCi)}
            {pair.hle.highCi ? `, ${pair.high.name}${ci(pair.hle.highCi)}` : ""}. These differences travel together, so this data can&apos;t
            say how much of the gap each explains.
          </>
        ),
      }
    }
    case "close": {
      const fell = data.areas.filter(
        (a) => a[sex][index.now] !== null && a[sex][index.stall] !== null && (a[sex][index.now] as number) <= (a[sex][index.stall] as number) - REAL_FALL
      )
      const eng = fell.filter((a) => a.decile !== null)
      const deprived = eng.filter((a) => (a.decile as number) <= 5).length
      const d = (code: string) => {
        const a = data.areas.find((x) => x.code === code)!
        return (a[sex][index.now] as number) - (a[sex][index.stall] as number)
      }
      const moveText = (v: number) =>
        Math.abs(v) < 0.05
          ? "barely moved"
          : `${v > 0 ? "gained" : "lost"} ${Math.abs(Math.abs(v) - 1) < 0.05 ? "a year" : Math.abs(v) > 1 ? `${years(Math.abs(v))} years` : monthsWord(v)}`
      return {
        title: "Back where we began",
        body: (
          <>
            The map again, coloured by change since {P[index.stall]}. <B>{fell.length}</B> places are at least six months lower for{" "}
            {w.plural}
            {eng.length && deprived / eng.length >= 0.6 ? `; in England, ${deprived} of those ${eng.length} are in the more deprived half` : ""}.
            Since {P[index.stall]} {pair.high.name} has {moveText(d(pair.high.code))}; {pair.low.name} has {moveText(d(pair.low.code))}.
          </>
        ),
        note: "Each figure is uncertain by about ±0.6 years, and a change between two periods by more, so some of these falls may be chance.",
      }
    }
  }
  return { title: "", body: null }
}

/** Sources and methods, shown from the header and the closing scene. */
export function Methods({ data }: { data: FilmData }) {
  return (
    <div className="space-y-4 text-[14px] leading-relaxed text-ink-2">
      <p>
        <B>Life expectancy</B> is period life expectancy at birth from ONS, for three-year periods up to {data.periods[data.index.now]}. It
        summarises the death rates of that period; it is not a prediction for anyone born then. Single-area figures carry 95% confidence
        intervals of about ±0.6 years. ONS publishes no local figure for the City of London or the Isles of Scilly.
      </p>
      <p>
        <B>Deprivation</B> groups rank English local authorities by their IMD 2025 score into ten groups of 29 or 30, and keep that ranking
        for every period. The score includes a health domain. Group figures are unweighted averages of areas.
      </p>
      <p>
        <B>Healthy life expectancy</B> (ONS, official statistics in development) estimates years lived in self-rated good or very good health.
        It is published for upper-tier areas, is uncertain by about ±3.5 years for one area, and its survey changed during the pandemic.
      </p>
      <p>
        <B>Avoidable deaths</B> are ONS age-standardised rates under 75 for England and Wales. Since 2020 COVID-19 deaths count as
        preventable.
      </p>
      <p>
        <B>Circumstances</B> come from OHID Fingertips (fetched {data.fetched}), England only. Child poverty is absolute low income before
        housing costs.
      </p>
      <p>
        <B>International</B> figures are single calendar years from {data.intl.source} (fetched {data.intl.fetched}), for the{" "}
        {data.intl.countries.length} OECD members. The OECD average is the unweighted mean of members; Latvia&apos;s 2001 and
        Türkiye&apos;s 2024 figures, not yet published, are filled from their nearest year. Paces are least-squares trends across
        2001–11 and 2011–19. Ranks share a place when figures tie.
      </p>
      <p className="text-[12.5px] text-ink-3">
        ONS and OHID data are reused under the Open Government Licence v3.0; OECD data under CC BY 4.0. Hex map layout by Open Innovations
        (MIT).
      </p>
    </div>
  )
}
