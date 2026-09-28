import type { ReactNode } from "react"
import type { FilmData, Sex } from "@/lib/compute"
import { capital, months, signed, words, years } from "@/lib/format"

export type CopyCtx = { data: FilmData; sex: Sex; factor: number }

type Copy = { title: string; body: ReactNode; note?: ReactNode; stat?: { value: string; label: string } }

const WHO = {
  male: { plural: "men", adj: "male", child: "boy" },
  female: { plural: "women", adj: "female", child: "girl" },
} as const

const other = (s: Sex): Sex => (s === "male" ? "female" : "male")
const moved = (d: number) => (Math.abs(d) < 0.05 ? "barely changed" : `${d > 0 ? "gained" : "lost"} ${years(Math.abs(d))} years`)

/** "the three most deprived tenths went backwards; the other seven gained", counted from the data. */
function split(moves: number[]) {
  const fell = moves.findIndex((m) => m >= 0)
  const n = fell === -1 ? 10 : fell
  if (n > 0 && moves.slice(n).every((m) => m >= 0))
    return `The ${n === 1 ? "most deprived tenth" : `${words(n)} most deprived tenths`} went backwards; ${n === 9 ? "the other one" : `the other ${words(10 - n)}`} gained.`
  return `${capital(words(moves.filter((m) => m < 0).length))} of the ten tenths went backwards.`
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

  switch (id) {
    case "open":
      return {
        title: "Ten years apart",
        body: (
          <>
            A {w.child} born in <B>{pair.high.name}</B> can expect to live {years(pairGap(sex))} years longer than one born in{" "}
            <B>{pair.low.name}</B>, if today&apos;s death rates hold. This is where that gap lies, how progress stalled, and who it
            left behind.
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
            Every UK local authority, placed by how long its {w.plural} can expect to live. Most crowd the middle: half sit within{" "}
            {years(ext.iqr)} years of each other. The tails reach from {years(ext.bottom.value)} in {ext.bottom.name} to{" "}
            {years(ext.top.value)} in {ext.top.name}.
          </>
        ),
        note: (
          <>
            For {WHO[o].plural} the range runs from {extremes[o].bottom.name} ({years(extremes[o].bottom.value)}) to{" "}
            {extremes[o].top.name} ({years(extremes[o].top.value)}).
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
    case "ends":
      return {
        title: "The two ends",
        body: (
          <>
            Ringed: the ten highest and ten lowest for {w.plural}. {ext.topTenEngland === 10 ? "All ten" : capital(words(ext.topTenEngland))}{" "}
            of the highest are in England. {capital(words(ext.bottomTenScotland))} of the ten lowest{" "}
            {ext.bottomTenScotland === 1 ? "is" : "are"} in Scotland.
          </>
        ),
      }
    case "rewind":
      return {
        title: "Back to 2001",
        body: (
          <>
            Stand the dots on a timeline and wind back to {data.periods[0]}. {capital(WHO[sex].plural)} in the UK could then expect{" "}
            {years(stall[sex].start)} years. Each dot is still a place; the ink line will be the UK.
          </>
        ),
      }
    case "gains": {
      const up = data.areas.filter((a) => (a[sex][index.stall] ?? 0) > (a[sex][index.start] ?? Infinity)).length
      return {
        title: "A decade of gains",
        body: (
          <>
            From {data.periods[0]} to {data.periods[index.stall]}, UK life expectancy rose by about {months(stall.male.pre)} months a
            year for men and {months(stall.female.pre)} for women. {up === data.areas.length ? "Every place" : `${up} of ${data.areas.length} places`}{" "}
            moved up.
          </>
        ),
      }
    }
    case "flat":
      return {
        title: "Then it flattened",
        body: (
          <>
            Between {data.periods[index.stall]} and {data.periods[index.precovid]} the gains shrank to {months(stall.male.post)} months a
            year for men and {months(stall.female.post)} for women. The slowdown began years before the pandemic.
          </>
        ),
      }
    case "covid":
      return {
        title: "COVID and after",
        body: (
          <>
            COVID-19 pushed life expectancy down. By {data.periods[index.now]} {w.plural} were at {years(stall[sex].now)} years,{" "}
            {stall[sex].now < stall[sex].precovid ? "still below" : "back to"} their {data.periods[index.precovid]} level of{" "}
            {years(stall[sex].precovid)}. Had the 2001–13 pace continued, they would be at about {years(stall[sex].trendNow)}.
          </>
        ),
        note: "The dashed line extends the earlier trend. It is not a forecast.",
        stat: { value: years(stall[sex].shortfall), label: `years below the earlier trend, ${w.plural}` },
      }
    case "tenths":
      return {
        title: "Ten steps down",
        body: (
          <>
            England&apos;s {data.englandAreas} local authorities in ten equal groups by deprivation score (IMD 2025). Black ticks mark
            each group&apos;s average: {years(rows[0][index.now])} years for {w.plural} in the most deprived tenth,{" "}
            {years(rows[9][index.now])} in the least.
          </>
        ),
        note: "Wales, Scotland and Northern Ireland use different indices, so they sit apart.",
      }
    case "moved":
      return {
        title: "Moving apart",
        body: (
          <>
            Now each dot sits at how far {w.adj} life expectancy moved between {data.periods[index.stall]} and{" "}
            {data.periods[index.now]}. {split(rows.map(change))} Across the UK, <B>{data.lower[sex]}</B> of {data.areas.length} places
            are lower than in {data.periods[index.stall]}.
          </>
        ),
      }
    case "widening": {
      const gap = (s: Sex, i: number) => data.deciles[s][9][i] - data.deciles[s][0][i]
      return {
        title: "Parting ways",
        body: (
          <>
            Averaged, each tenth becomes one line. For a decade the most and least deprived rose side by side, about{" "}
            {years(gap(sex, index.stall))} years apart. After {data.periods[index.stall]} they parted: by {data.periods[index.now]} the gap
            was <B>{years(gap(sex, index.now))} years</B> for {w.plural} ({years(gap(o, index.now))} for {WHO[o].plural}).
          </>
        ),
        note: "Averages of local authorities, not weighted by population. Grouping whole authorities narrows the gap.",
      }
    }
    case "avoidable": {
      const av = data.avoidable[sex]
      return {
        title: "Deaths before 75",
        body: (
          <>
            A death under 75 counts as avoidable if public health measures or timely healthcare could mostly prevent it. In{" "}
            {data.avoidable.now}, {w.plural} in the most deprived tenth died from avoidable causes at {Math.round(av[0].now)} per 100,000,{" "}
            {(av[0].now / av[9].now).toFixed(1)} times the rate in the least deprived. Since {data.avoidable.then} the rate has{" "}
            {avTrend(av)}.
          </>
        ),
      }
    }
    case "healthy": {
      const r = data.healthy.rows
      const h0 = r[0][sex]
      const h9 = r[9][sex]
      return {
        title: "The years in between",
        body: (
          <>
            Healthy life expectancy counts the years people rate their health as good or very good. {capital(w.plural)} in the least
            deprived tenth can expect <B>{years(h9.healthy - h0.healthy)} more healthy years</B> than those in the most deprived, twice
            the {years(h9.life - h0.life)}-year gap in lifespan.
          </>
        ),
        note: "Published for upper-tier areas in England; ONS labels it official statistics in development.",
      }
    }
    case "poverty": {
      const f = data.factors[0]
      return {
        title: "What travels with it",
        body: (
          <>
            Back to places, England only. Life expectancy lines up closely with child poverty (r = {signed(f.fit[sex].r, 2)}), nearly as
            closely as with the deprivation score ({signed(data.imdR[sex], 2)}), which partly measures health. Child poverty doesn&apos;t.
          </>
        ),
        note: "Correlations between areas. They don't show cause and say nothing about any individual.",
      }
    }
    case "factors": {
      const f = data.factors[factor] ?? data.factors[1]
      const air = f.key === "airPollution"
      return {
        title: air ? "Not everything lines up" : "And the rest",
        body: air ? (
          <>
            Air pollution barely correlates. {data.air.london === 30 ? "All 30" : data.air.london} of the 30 areas with the highest burden
            are London boroughs, and their men average {years(data.air.maleMean)} years, against {years(data.air.englandMale)} for England.
          </>
        ) : (
          <>
            {f.label} lines up with shorter lives too (r = {signed(f.fit[sex].r, 2)}), less tightly than child poverty. These circumstances
            overlap, so their links can&apos;t simply be added up.
          </>
        ),
      }
    }
    case "pair": {
      const le = pair.le
      const g0 = (le.high[0] as number) - (le.low[0] as number)
      const gN = (le.high[index.now] as number) - (le.low[index.now] as number)
      return {
        title: `${pair.low.name} and ${pair.high.name}`,
        body: (
          <>
            Back to the two places we started with. For {w.plural} the gap was {years(g0)} years in {data.periods[0]}. Since then{" "}
            {pair.high.name} {moved((le.high[index.now] as number) - (le.high[0] as number))} and {pair.low.name}{" "}
            {moved((le.low[index.now] as number) - (le.low[0] as number))}, so it has {gN >= g0 ? "widened" : "narrowed"} to{" "}
            <B>{years(gN)}</B>.
          </>
        ),
      }
    }
    case "why": {
      const av = pair.avoidable
      const last = av.low.length - 1
      const kids = pair.factors.find((f) => f.key === "childPoverty")!
      const lowE = pair.standIn.low?.name ?? pair.low.name
      const highE = pair.standIn.high?.name ?? pair.high.name
      const rank = (r: { rank: number; of: number }) =>
        r.rank === 1 ? "is England's most deprived local authority" : r.rank === r.of ? "is the least deprived" : `ranks ${r.rank} of ${r.of}`
      return {
        title: "What differs",
        body: (
          <>
            {pair.hle.low !== null && pair.hle.high !== null ? (
              <>
                {capital(w.plural)} in {pair.low.name} can expect {years(pair.hle.low)} years in good health, {years(pair.hle.high - pair.hle.low)}{" "}
                fewer than in {pair.high.name}.{" "}
              </>
            ) : pair.hle.low !== null && pair.hle.england !== null ? (
              <>
                {capital(w.plural)} in {pair.low.name} can expect {years(pair.hle.low)} years in good health, against {years(pair.hle.england)} for
                England.{" "}
              </>
            ) : null}
            In {lowE}, {w.plural} die from avoidable causes at {((av.low[last] as number) / (av.high[last] as number)).toFixed(1)} times the
            rate in {highE}, and {years(kids.low)}% of children live in low-income families, against {years(kids.high)}%. On the 2025
            index {lowE} {rank(pair.imd.low)}; {highE} {rank(pair.imd.high)}.
          </>
        ),
        note: pair.standIn.low ? (
          <>
            {pair.low.name} is in Scotland, where avoidable deaths and the England-only measures aren&apos;t published, so{" "}
            {pair.standIn.low.name}, England&apos;s lowest for {w.plural}, stands in (hollow dots). These differences travel together, so
            this data can&apos;t say how much of the gap each explains.
          </>
        ) : (
          "These differences travel together, so this data can't say how much of the gap each explains."
        ),
      }
    }
    case "close": {
      const fell = data.areas.filter((a) => a[sex][index.now] !== null && a[sex][index.stall] !== null && (a[sex][index.now] as number) < (a[sex][index.stall] as number))
      const engFell = fell.filter((a) => a.decile !== null)
      const inMoreDeprived = engFell.filter((a) => (a.decile as number) <= 5).length
      return {
        title: "Whether gains reach every place",
        body: (
          <>
            The map again, now coloured by change since {data.periods[index.stall]}. <B>{data.lower[sex]}</B> places went backwards for {w.plural}
            {engFell.length && inMoreDeprived / engFell.length >= 0.6
              ? `; in England, ${inMoreDeprived} of those ${engFell.length} are in the more deprived half`
              : ""}
            . The difference isn&apos;t only how long people live. It is how many of those years are healthy, and whether gains reach
            every place.
          </>
        ),
      }
    }
  }
  return { title: "", body: null }
}
