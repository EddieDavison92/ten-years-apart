"use client"

import Link from "next/link"
import { useMemo, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AvoidableDots } from "@/components/story/AvoidableDots"
import { ComparePlaces, type Pair } from "@/components/story/ComparePlaces"
import { DecileLines } from "@/components/story/DecileLines"
import { DotStage, type DotScene } from "@/components/story/DotStage"
import { FactorGrid } from "@/components/story/FactorGrid"
import { Lifelines } from "@/components/story/Lifelines"
import { PairCompare } from "@/components/story/PairCompare"
import { HIGH, LOW, PairLines } from "@/components/story/PairLines"
import { PlaceSearch } from "@/components/story/PlaceSearch"
import { Scrolly } from "@/components/story/Scrolly"
import { SexToggle } from "@/components/story/SexToggle"
import { StallChart } from "@/components/story/StallChart"
import { formatSigned, formatYears } from "@/lib/explorer/format"
import { cn } from "@/lib/utils"
import type { StoryData } from "@/lib/story/data"
import { INK } from "@/lib/story/palette"

const months = (years: number) => Math.round(years * 12 * 10) / 10
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
const words = (n: number) => WORDS[n] ?? String(n)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
type Sex = "male" | "female"
const WHO = {
  male: { plural: "men", adj: "male", child: "boy" },
  female: { plural: "women", adj: "female", child: "girl" },
} as const
const moved = (d: number) =>
  Math.abs(d) < 0.05 ? "barely changed" : `${d > 0 ? "gained" : "lost"} ${formatYears(Math.abs(d))} years`

export function Story({ data }: { data: StoryData }) {
  const { index, extremes, stall, facts, deciles, lower, avoidableDeciles } = data
  const [sex, setSex] = useState<Sex>("male")
  const other: Sex = sex === "male" ? "female" : "male"
  const who = WHO[sex]
  const places = useMemo(
    () => data.areas.map((a) => ({ code: a.code, name: a.name, geo: "ltla" as const })),
    [data.areas]
  )
  const areaOf = (code: string) => data.areas.find((a) => a.code === code)
  const range = (s: Sex) => extremes[s].top.value - extremes[s].bottom.value

  // The opening pair: the highest and lowest places for men, kept for women too.
  const high = extremes.male.top
  const low = extremes.male.bottom
  const pairGap = (s: Sex) => (areaOf(high.code)?.[s][index.now] ?? 0) - (areaOf(low.code)?.[s][index.now] ?? 0)
  const [compare, setCompare] = useState<Pair>({ mine: null, other: high.code })
  const marked = compare.mine ? [compare.mine, compare.other] : [high.code, low.code]

  const rows = deciles[sex]
  const d1 = rows[0]
  const d10 = rows[9]
  const change = (row: (number | null)[]) => (row[index.now] ?? 0) - (row[index.stall] ?? 0)
  // How many of the most deprived tenths went backwards, counted from the data.
  const moves = rows.map(change)
  const fell = moves.findIndex((m) => m >= 0)
  const fellCount = fell === -1 ? 10 : fell
  const splitSentence =
    fellCount > 0 && moves.slice(fellCount).every((m) => m >= 0)
      ? `The ${fellCount === 1 ? "most deprived tenth" : `${words(fellCount)} most deprived tenths`} went backwards; ${
          fellCount === 9 ? "the other one" : `the other ${words(10 - fellCount)}`
        } gained.`
      : `${capital(words(moves.filter((m) => m < 0).length))} of the ten tenths went backwards.`

  const avRows = avoidableDeciles[sex]
  const avMost = avRows[0]
  const avLeast = avRows[9]
  // Which tenths' avoidable death rates rose since the earlier period, most deprived first.
  const avTrend = (list: { then: number | null; now: number | null }[]) => {
    const rose = list.map((r) => (r.now ?? 0) > (r.then ?? 0))
    const k = rose.indexOf(false)
    const lead = k === -1 ? 10 : k
    const most = Math.max(...list.map((r) => ((r.now ?? 0) - (r.then ?? 0)) / (r.then || 1)))
    const up = most < 0.05 ? "edged up" : "risen"
    return lead > 0 && rose.slice(lead).every((r) => !r)
      ? `${up} in the ${lead === 1 ? "most deprived tenth" : `${words(lead)} most deprived tenths`} and fallen in the other ${words(10 - lead)}`
      : `${up} in ${words(rose.filter(Boolean).length)} of the ten tenths`
  }

  // IMD partly measures health; child poverty doesn't, so it's the cleaner comparison.
  const rOf = (key: string) => data.factors.find((f) => f.indicator.key === key)?.[sex].r ?? null
  const rImd = rOf("imd")
  const rKids = rOf("childPoverty")
  const healthy = data.lifelines.map((l) => l[sex].healthy ?? 0)

  const reference = { male: stall.male.now, female: stall.female.now }
  const gapScenes: DotScene[] = [
    { layout: "map", colour: "gap", sex, highlight: marked },
    { layout: "map", colour: "gap", sex, highlight: marked, rings: [...extremes[sex].topTen, ...extremes[sex].bottomTen] },
    { layout: "rank", colour: "gap", sex, highlight: marked },
  ]
  const tenths: DotScene = { layout: "decile", colour: "decile", sex, means: true }
  const shifts: DotScene = { layout: "change", colour: "change", sex, means: true }
  const topTen = facts.topTenEngland[sex]
  const bottomScots = facts.bottomTenScotland[sex]

  return (
    <article className="pb-24">
      <HeaderSlot>
        <SexToggle value={sex} onChange={setSex} size="sm" />
      </HeaderSlot>

      {/* Ten years apart */}
      <Scrolly
        id="gap"
        stage={(step) => (
          <DotStage areas={data.areas} scene={gapScenes[step]} now={index.now} base={index.stall} reference={reference} intro />
        )}
        steps={[
          <div key="intro" className="max-w-xl">
            <p className="kicker animate-rise">Life expectancy across the UK · 2001–2024</p>
            <h1 className="display mt-3 animate-rise text-[clamp(3rem,6.6vw,6.25rem)] leading-[0.9] text-ink [animation-delay:120ms] sm:mt-6">
              <span className="block whitespace-nowrap">Ten years</span>
              <span className="mt-[0.08em] flex items-center gap-[0.18em]">
                <Ruler />
                <span>apart</span>
              </span>
            </h1>
            <p className="mt-4 max-w-md animate-rise text-[15.5px] leading-relaxed text-ink-2 [animation-delay:260ms] sm:mt-8 sm:text-lg">
              A {who.child} born in <strong className="font-semibold text-ink">{high.name}</strong> can expect to live{" "}
              {formatYears(pairGap(sex))} years longer than one born in{" "}
              <strong className="font-semibold text-ink">{low.name}</strong>
              {sex === "female" ? ` (for boys the gap is ${formatYears(pairGap("male"))})` : null}, if today&apos;s death
              rates hold. This is where that gap lies, how progress stalled, who it left behind, and what differs between the
              two ends.
            </p>
            <ComparePlaces areas={data.areas} places={places} sex={sex} now={index.now} pair={compare} stand={low.code} uk={reference[sex]} onChange={setCompare} />
            <ScrollCue count={data.areas.length} />
          </div>,
          <Step key="map" title="Every dot is a place">
            <p>
              Each of the {data.areas.length} dots is a UK local authority, set roughly where it sits on the map. Colour
              shows how far {who.adj} life expectancy in 2022–24 sits from the UK figure of {formatYears(reference[sex])}{" "}
              years: <span className="font-semibold text-[#b3452c]">red</span> for shorter,{" "}
              <span className="font-semibold text-[#2a8a76]">green</span> for longer.
            </p>
            <p>
              The ringed dots are the ten highest and ten lowest. {topTen === 10 ? "All ten" : capital(words(topTen))} of the
              highest are in England. {capital(words(bottomScots))} of the ten lowest {bottomScots === 1 ? "is" : "are"} in
              Scotland.
            </p>
            <p className="text-sm text-ink-3">Hover or tap any dot for its figures.</p>
          </Step>,
          <Step key="rank" title="Lined up">
            <p>
              Sort every place by {who.adj} life expectancy and most crowd the middle: half sit within{" "}
              {formatYears(sex === "male" ? facts.iqrMale : facts.iqrFemale)} years of each other. The tails reach much
              further, from {formatYears(extremes[sex].bottom.value)} in {extremes[sex].bottom.name} to{" "}
              {formatYears(extremes[sex].top.value)} in {extremes[sex].top.name}.
            </p>
            <p>
              For {WHO[other].plural} the range is {formatYears(range(other))} years, from {extremes[other].bottom.name} (
              {formatYears(extremes[other].bottom.value)}) to {extremes[other].top.name} (
              {formatYears(extremes[other].top.value)}).
            </p>
          </Step>,
        ]}
      />

      {/* The stall */}
      <ChapterHead title="The stall" dek="For a decade life expectancy rose steadily. Then, well before COVID-19, it almost stopped." />
      <Scrolly
        id="stall"
        side="right"
        stage={(step) => <StallChart data={data} step={step} sex={sex} />}
        steps={[
          <Step key="rise" title="A decade of gains">
            <p>
              From 2001–03 to 2011–13, UK life expectancy rose by about {months(stall.male.pre)} months a year for men
              and {months(stall.female.pre)} months for women.
            </p>
          </Step>,
          <Step key="flat" title="Then it flattened">
            <p>
              Between 2011–13 and 2017–19 the gains shrank to {months(stall.male.post)} months a year for men and{" "}
              {months(stall.female.post)} for women. The slowdown began years before the pandemic.
            </p>
          </Step>,
          <Step key="covid" title="COVID and after">
            <p>
              COVID-19 pushed life expectancy down. By 2022–24 {who.plural} were at {formatYears(stall[sex].now)} years,{" "}
              {stall[sex].now < stall[sex].precovid ? "still below" : "back to"} their 2017–19 level of{" "}
              {formatYears(stall[sex].precovid)}. {capital(WHO[other].plural)} were at {formatYears(stall[other].now)}.
            </p>
            <p>
              Had the 2001–13 pace simply continued, {who.plural} would be at about {formatYears(stall[sex].trendNow)}. The
              dashed line extends that earlier trend; it is not a forecast.
            </p>
            <BigStat value={formatYears(stall[sex].shortfall)} label={`years below the earlier trend, ${who.plural}`} />
          </Step>,
        ]}
      />

      {/* The split */}
      <ChapterHead
        title="The split"
        dek="The stall wasn't shared equally. In England, the most deprived local authorities slipped back while the least deprived kept gaining."
      />
      <Scrolly
        id="split"
        stage={(step) => (
          <div className="relative h-full">
            {/* The same dots slide from level to change. */}
            <Layer on={step <= 1}>
              <DotStage areas={data.areas} scene={step === 0 ? tenths : shifts} now={index.now} base={index.stall} reference={reference} />
            </Layer>
            <Layer on={step === 2}>
              <DecileLines data={data} sex={sex} active={step >= 2} />
            </Layer>
            <Layer on={step >= 3}>
              <AvoidableDots
                rows={avRows}
                label={`${capital(who.plural)}: avoidable deaths under 75 per 100,000, average of English local authorities in each deprivation tenth`}
                shortLabel={`${capital(who.plural)}: avoidable deaths under 75, per 100,000`}
                periods={{ then: avoidableDeciles.then, now: avoidableDeciles.now }}
                active={step >= 3}
              />
            </Layer>
          </div>
        )}
        steps={[
          <Step key="tenths" title="Ten steps down">
            <p>
              Here England&apos;s {facts.englandAreas} local authorities are split into ten equal groups by their
              deprivation score (IMD 2025). Black ticks mark each group&apos;s average.
            </p>
            <p>
              Life expectancy falls with each step: {who.plural} in the most deprived tenth of local authorities average{" "}
              {formatYears(d1[index.now])} years, in the least deprived {formatYears(d10[index.now])}. Wales, Scotland and
              Northern Ireland use different indices, so they sit apart.
            </p>
          </Step>,
          <Step key="moved" title="Moving apart">
            <p>
              Now each dot sits at how far {who.adj} life expectancy moved between 2011–13 and 2022–24. Black ticks mark
              each tenth&apos;s average. {splitSentence}
            </p>
            <p>
              The least deprived tenth {moved(change(d10))}; the most deprived {moved(change(d1))}. For {WHO[other].plural},
              the least deprived tenth {moved(change(deciles[other][9]))} and the most deprived{" "}
              {moved(change(deciles[other][0]))}.
            </p>
            <p>
              Across the UK, {lower[sex]} of {lower.of} places, every dot left of zero, now have lower {who.adj} life
              expectancy than in 2011–13.
            </p>
          </Step>,
          <Step key="gap" title="A wider gap">
            <p>
              The gap between the most and least deprived tenths of local authorities grew from{" "}
              {formatYears(deciles.gapMale[index.stall])} to {formatYears(deciles.gapMale[index.now])} years for men, and
              from {formatYears(deciles.gapFemale[index.stall])} to {formatYears(deciles.gapFemale[index.now])} for women.
            </p>
            <p className="text-sm text-ink-3">
              Each local authority mixes richer and poorer neighbourhoods, so grouping whole authorities narrows the gap;
              ONS figures that group neighbourhoods by deprivation show a wider one. Areas keep today&apos;s ranking
              throughout, and averages are of areas, not weighted by population.
            </p>
          </Step>,
          <Step key="avoidable" title="Deaths before 75">
            <p>
              ONS counts a death under 75 as avoidable if it could mostly be prevented by public health measures or treated
              by timely healthcare. Each dot here is five such deaths per 100,000 {who.plural} a year.
            </p>
            <p>
              In {avoidableDeciles.now}, {who.plural} in the most deprived tenth died from avoidable causes at{" "}
              {Math.round(avMost.now ?? 0)} per 100,000 on average, {((avMost.now ?? 0) / (avLeast.now ?? 1)).toFixed(1)}{" "}
              times the rate in the least deprived ({Math.round(avLeast.now ?? 0)}).
            </p>
            <p>
              Since {avoidableDeciles.then} the rate has {avTrend(avRows)}.
              {avTrend(avoidableDeciles[other]) === avTrend(avRows) ? ` The same holds for ${WHO[other].plural}.` : null}
            </p>
          </Step>,
        ]}
      />

      {/* The years in between */}
      <ChapterHead
        title="The years in between"
        dek="Healthy life expectancy counts the years people rate their health as good or very good. Here the gap is wider still."
      />
      <Section>
        <Lifelines data={data} sex={sex} />
        <Notes>
          Healthy life expectancy is published for upper-tier authorities in England; districts share their
          county&apos;s figure. ONS labels it official statistics in development, and its survey changed during the
          pandemic. UK healthy life expectancy for {who.plural} was {formatYears(data.ukHle[sex][0])} in{" "}
          {data.ukHle.periods[0].replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")} and {formatYears(data.ukHle[sex].at(-1))} in{" "}
          {data.ukHle.periods.at(-1)?.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")}; treat that change with some caution.
        </Notes>
      </Section>

      {/* What travels with it */}
      <ChapterHead
        title="What travels with it"
        dek={`Across English local authorities, life expectancy lines up closely with local circumstances. Each panel plots one against ${who.adj} life expectancy.`}
      />
      <Section>
        <FactorGrid data={data} sex={sex} />
        <Notes>
          These are correlations between areas (Pearson r, −1 to +1). They don&apos;t show cause, they overlap with each
          other, and they say nothing about any individual.
          {rImd !== null && rKids !== null ? (
            <>
              {" "}
              The deprivation score partly measures health: one of its domains counts early deaths, so some of its link
              with life expectancy is built in. Child poverty has no health component and lines up almost as closely (r ={" "}
              {formatSigned(rKids, 2)}, against {formatSigned(rImd, 2)} for deprivation).
            </>
          ) : null}{" "}
          Air pollution barely correlates: {facts.airTop30London === 30 ? "all 30" : facts.airTop30London} of the 30 areas
          with the highest burden are London boroughs, and their men average {formatYears(facts.airTop30MaleMean)} years,
          against {formatYears(facts.englandMale)} for England. Factors come from OHID Fingertips (fetched {data.fetched});
          see the periods on each panel.
        </Notes>
      </Section>

      {/* The two ends, again */}
      <PairChapter data={data} sex={sex} />

      {/* What to carry away */}
      <section className="mt-36 border-t-[3px] border-ink pt-10 sm:mt-48">
        <p className="display max-w-4xl text-[clamp(1.9rem,3.6vw,3.25rem)] leading-[1.08] text-ink">
          The difference isn&apos;t only how long people live. It is how many of those years are spent in good health, and
          whether gains reach every place.
        </p>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 lg:ml-[calc(5/13*100%+1.25rem)]">
          {capital(who.plural)} in England&apos;s least deprived areas can expect {formatYears(healthy[9] - healthy[0])}{" "}
          more years in good health than those in the most deprived. Since 2011–13, the least deprived tenth of local
          authorities {moved(change(d10))} of life expectancy; the most deprived {moved(change(d1))}.
        </p>
      </section>

      {/* Your place */}
      <ChapterHead
        title="Your place"
        dek="See how your local authority compares: life expectancy, healthy years, the trend since 2001 and local circumstances."
      />
      <Section>
        <PlaceSearch areas={places} className="max-w-xl" />
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <span className="mono self-center text-[11px] uppercase tracking-wider text-ink-3">Try</span>
          {[extremes.male.top, extremes.male.bottom, extremes.female.top].map((a) => (
            <Link
              key={a.code}
              href={`/area/${a.code}`}
              className="rounded-full border border-line bg-white/60 px-3.5 py-1.5 text-ink-2 transition hover:border-ink/25 hover:text-ink"
            >
              {a.name}
            </Link>
          ))}
        </div>
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card href="/explore" title="The atlas" body="Every measure on one map, from 2001–03 to 2022–24." />
          <Card href="/evidence" title="The evidence" body="All fifteen local indicators, plotted and ranked." />
        </div>
      </Section>
    </article>
  )
}

/** The lowest and highest places side by side: the gap over time, avoidable deaths, then factor by factor. */
function PairChapter({ data, sex }: { data: StoryData; sex: Sex }) {
  const { pair, index, periods } = data
  const { low, high } = pair
  const { le, avoidable: av, hle, rows } = pair[sex]
  const who = WHO[sex]
  const short = (p: string) => p.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")
  const at = (s: (number | null)[], i: number) => s[i] ?? 0
  const gapThen = at(le.high, index.start) - at(le.low, index.start)
  const gapNow = at(le.high, index.now) - at(le.low, index.now)
  // The chapter is named for the men's gap, the one the story opens with.
  const gapMale = at(pair.male.le.high, index.now) - at(pair.male.le.low, index.now)
  const avLast = av.low.length - 1
  const fall = (s: (number | null)[]) => {
    const pct = Math.round((1 - at(s, avLast) / at(s, 0)) * 100)
    return pct >= 0 ? `fallen by ${pct}%` : `risen by ${-pct}%`
  }
  const row = (key: string) => rows.find((r) => r.key === key)!
  const times = (key: string) => {
    const r = row(key)
    return r.low !== null && r.high !== null ? (r.low / r.high).toFixed(1) : "–"
  }
  const causes = rows
    .filter((r) => r.key.startsWith("u75") && r.low !== null && r.high !== null)
    .sort((a, b) => b.low! / b.high! - a.low! / a.high!)
  const causeList = causes.map((r, i) => `${times(r.key)}${i === 0 ? " times" : ""} for ${r.label.toLowerCase()}`)
  const rankText = (r: number | null) =>
    r === 1 ? "the most deprived" : r === pair.imdOf ? "the least deprived" : r ? `number ${r} of ${pair.imdOf}` : "not ranked"
  const smoking = row("smoking")
  const air = row("airPollution")
  const kids = row("childPoverty")
  const Who = capital(who.plural)

  return (
    <>
      <ChapterHead
        title={`${low.name} and ${high.name}`}
        dek={`Back to the two places we started with. Side by side, the two ends of the ${words(Math.round(gapMale))}-year gap differ in which deaths come early, in how people live and in the circumstances around them.`}
      />
      <Scrolly
        id="pair"
        stage={(step) => (
          <div className="relative h-full">
            <Layer on={step === 0}>
              <PairLines
                periods={periods}
                lines={[
                  { label: low.name, values: le.low, colour: LOW },
                  { label: high.name, values: le.high, colour: HIGH },
                  { label: "UK", values: le.ref, colour: INK, reference: true },
                ]}
                title={`${Who}: life expectancy at birth, years`}
                bracket
                active={step === 0}
              />
            </Layer>
            <Layer on={step === 1}>
              <PairLines
                periods={pair.avPeriods}
                lines={[
                  { label: low.name, values: av.low, colour: LOW },
                  { label: high.name, values: av.high, colour: HIGH },
                  { label: "England", values: av.ref, colour: INK, reference: true },
                ]}
                title={`${Who}: avoidable deaths under 75, age-standardised per 100,000`}
                digits={0}
                active={step === 1}
              />
            </Layer>
            <Layer on={step >= 2}>
              <PairCompare rows={rows} names={{ low: low.name, high: high.name }} step={step - 2} />
            </Layer>
          </div>
        )}
        steps={[
          <Step
            key="widening"
            title={`${capital(words(Math.round(gapNow)))} years, and ${gapNow >= gapThen ? "widening" : "narrowing"}`}
          >
            <p>
              For {who.plural}, the gap between the two was {formatYears(gapThen)} years in {short(periods[index.start])}.
              Since then {who.plural} in {high.name} {moved(at(le.high, index.now) - at(le.high, index.start))} and in{" "}
              {low.name} {moved(at(le.low, index.now) - at(le.low, index.start))}, so it has{" "}
              {gapNow >= gapThen ? "widened" : "narrowed"} to {formatYears(gapNow)}.
            </p>
            {hle.low !== null ? (
              <p>
                Fewer of those years are healthy. {low.name} {who.plural} can expect {formatYears(hle.low)} of their{" "}
                {formatYears(at(le.low, index.now))} years in good health, against {formatYears(hle.england)} for England (
                {pair.hlePeriod}).
                {hle.high === null ? ` Healthy life expectancy isn't published for districts such as ${high.name}.` : null}
              </p>
            ) : null}
          </Step>,
          <Step key="avoidable" title="Avoidable deaths">
            <p>
              In {pair.avPeriod}, {who.plural} in {low.name} died from avoidable causes at {Math.round(at(av.low, avLast))} per
              100,000, {(at(av.low, avLast) / at(av.high, avLast)).toFixed(1)} times the rate in {high.name} (
              {Math.round(at(av.high, avLast))}; England {Math.round(at(av.ref, avLast))}). Since{" "}
              {short(pair.avPeriods[0])}, {high.name}&apos;s rate has {fall(av.high)}; {low.name}&apos;s has {fall(av.low)}.
            </p>
          </Step>,
          <Step key="deaths" title="Which deaths">
            <p>
              Among {who.plural}, preventable deaths are {times("preventable")} times as common in {low.name}; treatable
              deaths {times("treatable")} times.
            </p>
            <p>
              By cause, death rates for everyone under 75 are {causeList.slice(0, -1).join(", ")} and {causeList.at(-1)}{" "}
              those in {high.name}.
            </p>
            <p className="text-sm text-ink-3">Dots show each figure as a multiple of England&apos;s, on a log scale.</p>
          </Step>,
          <Step key="behaviour" title="How people live">
            <p>
              Alcohol-specific hospital admissions are {times("alcohol")} times as frequent in {low.name}. Physical
              inactivity is {times("inactive")} times as common, and obesity {times("obesity")} times.
            </p>
            {smoking.low !== null && smoking.england ? (
              <p>
                {formatYears(smoking.low)}% of adults in {low.name} smoke, {(smoking.low / smoking.england).toFixed(1)} times
                England&apos;s {formatYears(smoking.england)}%.
                {smoking.highFlag ? ` OHID flags ${high.name}'s smoking estimate for data quality, so it isn't compared.` : null}
              </p>
            ) : null}
          </Step>,
          <Step key="circumstances" title="And around them">
            <p>
              {low.name} is {rankText(low.imdRank)} local authority in England on the 2025 deprivation index; {high.name}{" "}
              is {rankText(high.imdRank)}. {formatYears(kids.low)}% of children in {low.name} live in low-income families,
              against {formatYears(kids.high)}% in {high.name}. Fuel poverty is {times("fuelPoverty")} times as common.
            </p>
            {air.low !== null && air.high !== null && air.high > air.low ? (
              <p>
                Not everything runs one way: a larger share of deaths in {high.name} is linked to fine-particulate air
                pollution.
              </p>
            ) : null}
            <p className="text-sm text-ink-3">
              These differences travel together, so this data can&apos;t say how much of the gap each explains. The
              previous chapter shows the same pattern across England.
            </p>
          </Step>,
        ]}
      />
    </>
  )
}

/** Renders into the site header's tools slot, once it exists. */
function HeaderSlot({ children }: { children: React.ReactNode }) {
  const target = useSyncExternalStore(
    () => () => {},
    () => document.getElementById("header-tools"),
    () => null
  )
  return target ? createPortal(children, target) : null
}

/** One of several stacked stages, crossfaded by step. */
function Layer({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("absolute inset-0 transition-opacity duration-700", on ? "opacity-100" : "pointer-events-none opacity-0")}>
      {children}
    </div>
  )
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-md">
      <h3 className="display text-[1.75rem] leading-tight text-ink sm:text-4xl">{title}</h3>
      <div className="prose-story mt-3 text-[15.5px] leading-relaxed text-ink-2 sm:mt-4 sm:text-[17px] [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </div>
  )
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="!mt-7 border-t-2 border-ink pt-3">
      <p className="display text-7xl text-ink">{value}</p>
      <p className="mono mt-1 text-[11px] text-ink-3">{label}</p>
    </div>
  )
}

/** Chapter opener: a heavy rule, the title, and a dek set in the stage column. */
function ChapterHead({ title, dek }: { title: string; dek: string }) {
  return (
    <header className="mt-36 border-t-[3px] border-ink pt-6 sm:mt-48">
      <h2 className="display max-w-5xl text-[clamp(2.75rem,7vw,6rem)] leading-[0.88] text-ink">{title}</h2>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2 lg:ml-[calc(5/13*100%+1.25rem)] lg:mt-8">{dek}</p>
    </header>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mt-16 lg:ml-[calc(5/13*100%+1.25rem)]">{children}</section>
}

function Notes({ children }: { children: React.ReactNode }) {
  return <p className="mt-10 max-w-3xl border-l-2 border-ink pl-4 text-sm leading-relaxed text-ink-2">{children}</p>
}

/** Three dots pulse down in turn; clicking goes to the first step. */
function ScrollCue({ count }: { count: number }) {
  const go = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document.querySelector('#gap [data-step="1"]')?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
  }
  return (
    <button
      type="button"
      onClick={go}
      className="group mt-10 hidden animate-rise items-center gap-4 text-left [animation-delay:700ms] lg:flex"
    >
      <span className="flex h-14 w-8 flex-col items-center justify-center gap-[7px] rounded-full border border-ink/15 transition-colors group-hover:border-ink/40">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full bg-ink motion-safe:animate-[cue_1.8s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
      <span>
        <span className="kicker block text-ink-2 transition-colors group-hover:text-ink">Scroll to begin</span>
        <span className="mt-1 block text-xs text-ink-3">{count} places, one dot each</span>
      </span>
    </button>
  )
}

/** Ten-year ruler between the two dots of the mark: brick (shorter) to teal (longer). */
function Ruler() {
  return (
    <span aria-hidden className="relative flex h-[0.5em] w-[2.1em] shrink-0 items-center">
      <span className="absolute inset-x-[0.11em] top-1/2 h-[2px] -translate-y-1/2 bg-ink" />
      <span className="absolute inset-x-[0.11em] top-1/2 flex -translate-y-1/2 items-center justify-between">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className={cn("w-[2px] bg-ink", i % 5 === 0 ? "h-[0.2em]" : "h-[0.1em]")} />
        ))}
      </span>
      <span className="absolute left-0 top-1/2 h-[0.22em] w-[0.22em] -translate-y-1/2 rounded-full bg-[#b3452c]" />
      <span className="absolute right-0 top-1/2 h-[0.22em] w-[0.22em] -translate-y-1/2 rounded-full bg-[#0b5a4c]" />
    </span>
  )
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between gap-6 rounded-2xl border border-line bg-white/60 p-6 transition hover:-translate-y-0.5 hover:border-ink/20 hover:bg-white hover:shadow-[0_20px_40px_-28px_rgba(17,19,21,0.4)]"
    >
      <p className="display text-4xl text-ink">
        {title} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
      </p>
      <p className="text-ink-2">{body}</p>
    </Link>
  )
}
