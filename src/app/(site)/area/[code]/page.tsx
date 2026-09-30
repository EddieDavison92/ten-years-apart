import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AreaTrend } from "@/components/area/AreaTrend"
import { Circumstances } from "@/components/area/Circumstances"
import { RankStrip } from "@/components/area/RankStrip"
import { SameDecile } from "@/components/area/SameDecile"
import { PlaceSearch } from "@/components/story/PlaceSearch"
import { formatCi, formatSigned, formatYears } from "@/lib/explorer/format"
import { exploreHref } from "@/lib/explorer/url-state"
import { getAreaReport, reportAreas, type AreaReport } from "@/lib/story/area"
import { decileColour, POOR_FILL } from "@/lib/story/palette"
import { cn } from "@/lib/utils"

export async function generateStaticParams() {
  return (await reportAreas()).map((a) => ({ code: a.code }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const report = await getAreaReport(code)
  if (!report) return {}
  return { title: report.name, description: summary(report) }
}

export default async function AreaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const report = await getAreaReport(code)
  if (!report) notFound()
  const areas = await reportAreas()
  const places = areas.map((a) => ({ code: a.code, name: a.name, geo: "ltla" as const }))
  const names = Object.fromEntries(areas.map((a) => [a.code, a.name]))
  const { male, female, nation } = report
  const kind = report.grain === "counties" ? "County" : "Local authority"
  const peers = report.grain === "counties" ? "English counties" : "local authorities"

  const trendValues = [male, female].flatMap((s) => [
    ...s.series.flatMap((p) => [p[1], p[2], p[0]]),
    ...s.nation,
    ...s.uk,
  ])
  const finite = trendValues.filter((v): v is number => typeof v === "number")
  const trendDomain: [number, number] = [Math.floor(Math.min(...finite) - 0.5), Math.ceil(Math.max(...finite) + 0.5)]
  const stripDomain = (sex: "male" | "female"): [number, number] => {
    const v = (sex === "male" ? male : female).distribution.map((d) => d[1])
    return [Math.floor(Math.min(...v)), Math.ceil(Math.max(...v))]
  }
  const decileDomain: [number, number] = (() => {
    const v = report.sameDecile.flatMap((r) => [r.male, r.female]).filter((x): x is number => x !== null)
    return v.length ? [Math.floor(Math.min(...v)) - 0.5, Math.ceil(Math.max(...v)) + 0.5] : [70, 90]
  })()

  return (
    <article className="mx-auto w-full max-w-6xl pb-16 pt-10 sm:pt-14">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl animate-rise">
          <p className="kicker">
            {nation.name} · {kind}
            {report.parent ? ` · ${report.parent.name}` : ""}
          </p>
          <h1 className="mt-3 display text-5xl text-ink sm:text-7xl">{report.name}</h1>
          <p className="mt-6 text-xl leading-relaxed text-ink-2">{summary(report)}</p>
        </div>
        <PlaceSearch areas={places} size="sm" placeholder="Another place or postcode" className="w-full shrink-0 md:w-72" />
      </div>

      {/* At a glance */}
      <dl className="mt-12 grid grid-cols-2 border-y border-line lg:grid-cols-4">
        <Glance sex="male" label="Men, at birth" point={male.now} vs={male.nationNow} nation={nation.name} />
        <Glance sex="female" label="Women, at birth" point={female.now} vs={female.nationNow} nation={nation.name} />
        <GlanceHealthy label="Healthy years, men" s={male} nation={nation.name} />
        <GlanceHealthy label="Healthy years, women" s={female} nation={nation.name} />
      </dl>

      <Section title="Over time" dek={`Life expectancy at birth since 2001–03, with the 95% interval, against ${nation.name} (dashed) and the UK (grey).`}>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <AreaTrend sex="male" periods={report.periods} series={male.series} nation={male.nation} uk={male.uk} nationName={nation.name} name={report.name} domain={trendDomain} />
          <AreaTrend sex="female" periods={report.periods} series={female.series} nation={female.nation} uk={female.uk} nationName={nation.name} name={report.name} domain={trendDomain} />
        </div>
      </Section>

      <Section title={`Among ${male.of} ${peers}`} dek="Each dot is one area, 2022–24. Hover to see which; click to open it.">
        <div className="space-y-6">
          {(["male", "female"] as const).map((sex) => {
            const s = sex === "male" ? male : female
            return (
              <div key={sex} className="grid grid-cols-1 gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
                <div>
                  <p className="text-sm font-medium text-ink">{sex === "male" ? "Men" : "Women"}</p>
                  <p className="display text-3xl tabular text-ink">
                    {s.rank ? ordinal(s.rank) : "–"}
                    <span className="ml-1 font-sans text-sm tracking-normal text-ink-3">of {s.of}</span>
                  </p>
                  <p className="text-2xs text-ink-3">1st = longest life expectancy</p>
                </div>
                <RankStrip sex={sex} distribution={s.distribution} code={report.code} names={names} domain={stripDomain(sex)} />
              </div>
            )
          })}
        </div>
      </Section>

      {male.healthy || female.healthy ? (
        <Section
          title="Healthy and not"
          dek={`Years expected in good health, and the rest, at birth in ${report.hlePeriod.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")}.${
            male.healthy?.via ? ` Healthy life expectancy is published for ${male.healthy.via}, not the district.` : ""
          }`}
        >
          <div className="space-y-5">
            {(["male", "female"] as const).map((sex) => {
              const h = (sex === "male" ? male : female).healthy
              if (!h || h.value === null || h.life === null) return null
              return (
                <div key={sex} className="space-y-2">
                  <p className="text-sm font-medium text-ink">{sex === "male" ? "Men" : "Women"}</p>
                  <LifeBar label={h.via ?? report.name} healthy={h.value} life={h.life} strong />
                  {h.nationHealthy !== null && h.nationLife !== null ? (
                    <LifeBar label={nation.name} healthy={h.nationHealthy} life={h.nationLife} />
                  ) : null}
                </div>
              )
            })}
            <p className="flex gap-5 text-xs text-ink-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#1a7a6b]" />
                Good or very good health
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm" style={{ background: POOR_FILL }} />
                Not in good health
              </span>
            </p>
          </div>
        </Section>
      ) : null}

      {report.deprivation?.decile ? (
        <Section
          title="Deprivation"
          dek={`${report.name} is in the ${decileWords(report.deprivation.decile)} of English local authorities by IMD 2025 score. These are the others in the same tenth, sorted by male life expectancy.`}
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div>
              <div className="flex gap-1" role="img" aria-label={`Deprivation tenth ${report.deprivation.decile} of 10`}>
                {Array.from({ length: 10 }, (_, d) => (
                  <span
                    key={d}
                    className={cn("h-8 flex-1 rounded-[3px]", d + 1 === report.deprivation!.decile ? "" : "opacity-20")}
                    style={{ background: decileColour(d + 1) }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-2xs text-ink-3">
                <span>Most deprived</span>
                <span>Least</span>
              </div>
              {report.deprivation.rank ? (
                <p className="mt-5 text-sm text-ink-2">
                  Ranked <span className="font-semibold tabular text-ink">{report.deprivation.rank}</span> of{" "}
                  {report.deprivation.of} on the English Indices of Deprivation 2025 (1 = most deprived).
                </p>
              ) : null}
              <p className="mt-4 flex gap-4 text-xs text-ink-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-male" /> Men
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-female" /> Women
                </span>
              </p>
            </div>
            <SameDecile rows={report.sameDecile} code={report.code} domain={decileDomain} />
          </div>
        </Section>
      ) : null}

      {report.factors.length ? (
        <Section
          title="Local circumstances"
          dek={`Latest OHID figures against England (grey tick). The shaded band is the middle half of ${
            report.factorGrain === "ltla" ? "English local authorities" : "English upper-tier authorities"
          }; teal is better than England, red worse. These travel with life expectancy but don't explain it on their own.`}
        >
          <Circumstances rows={report.factors.filter((f) => !f.outcome)} peers={report.factorGrain === "ltla" ? "areas" : "upper-tier areas"} />
          <h3 className="mb-1 mt-10 text-sm font-medium text-ink">Deaths, age-standardised per 100,000</h3>
          <Circumstances rows={report.factors.filter((f) => f.outcome)} peers={report.factorGrain === "ltla" ? "areas" : "upper-tier areas"} />
        </Section>
      ) : null}

      {report.avoidable ? (
        <Section
          title="Avoidable deaths"
          dek={`Deaths under 75 that could mostly have been avoided through prevention or timely treatment, ${report.avoidable.period.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")}, persons, per 100,000.`}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {report.avoidable.rows.map((row) => (
              <div key={row.dim} className="border-t border-line pt-3">
                <p className="text-sm capitalize text-ink-2">{row.dim}</p>
                <p className="mt-1 display text-4xl tabular text-ink">{formatYears(row.value, 0)}</p>
                <p className="text-xs text-ink-3">
                  {nation.name} {formatYears(row.nation, 0)}
                  {row.value !== null && row.nation !== null
                    ? ` · ${Math.round(((row.value - row.nation) / row.nation) * 100) >= 0 ? "+" : "−"}${Math.abs(Math.round(((row.value - row.nation) / row.nation) * 100))}%`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <p className="max-w-2xl text-sm text-ink-3">
          Period life expectancy summarises death rates in 2022–24; it isn&apos;t a forecast. Sources: ONS, OHID
          Fingertips (fetched {report.fetched}), MHCLG.{" "}
          <Link href="/about" className="link">
            Methods
          </Link>
        </p>
        <Link
          href={exploreHref({ area: report.code, geo: report.grain === "counties" ? "counties" : "ltla" })}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/85"
        >
          See it on the atlas →
        </Link>
      </div>
    </article>
  )
}

function Section({ title, dek, children }: { title: string; dek: string; children: React.ReactNode }) {
  return (
    <section className="mt-20 grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 className="display text-3xl text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">{dek}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Glance({
  sex,
  label,
  point,
  vs,
  nation,
}: {
  sex: "male" | "female"
  label: string
  point: [number | null, number | null, number | null] | null
  vs: number | null
  nation: string
}) {
  const v = point?.[0] ?? null
  const d = v !== null && vs !== null ? v - vs : null
  return (
    <div className="border-line px-0 py-6 odd:pr-4 even:border-l even:pl-4 sm:px-6 sm:odd:pr-6 sm:even:pl-6 lg:border-l lg:first:border-l-0 lg:first:pl-0">
      <dt className="flex items-center gap-2 text-sm text-ink-2">
        <span className={cn("h-2 w-2 rounded-full", sex === "male" ? "bg-male" : "bg-female")} />
        {label}
      </dt>
      <dd className="mt-2 display text-5xl tabular text-ink sm:text-6xl">{formatYears(v)}</dd>
      <p className="mt-1 text-xs tabular text-ink-3">{formatCi(point)}</p>
      {d !== null ? (
        <p className={cn("mt-2 text-sm tabular", d < 0 ? "text-loss" : "text-brand")}>
          {formatSigned(d)} years vs {nation}
        </p>
      ) : null}
    </div>
  )
}

function GlanceHealthy({
  label,
  s,
  nation,
}: {
  label: string
  s: AreaReport["male"]
  nation: string
}) {
  const h = s.healthy
  const d = h && h.value !== null && h.nationHealthy !== null ? h.value - h.nationHealthy : null
  return (
    <div className="border-t border-line py-6 odd:pr-4 even:border-l even:pl-4 sm:odd:pr-6 sm:even:pl-6 lg:border-l lg:border-t-0 lg:px-6">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-2 display text-5xl tabular text-ink sm:text-6xl">
        {formatYears(h?.value ?? null)}
      </dd>
      <p className="mt-1 text-xs tabular text-ink-3">
        {h?.lci != null && h?.uci != null ? `95% CI ${formatYears(h.lci)}–${formatYears(h.uci)}` : "Not published"}
        {h?.via ? ` · ${h.via}` : ""}
      </p>
      {d !== null ? (
        <p className={cn("mt-2 text-sm tabular", d < 0 ? "text-loss" : "text-brand")}>
          {formatSigned(d)} years vs {nation}
        </p>
      ) : null}
    </div>
  )
}

function LifeBar({ label, healthy, life, strong }: { label: string; healthy: number; life: number; strong?: boolean }) {
  const SPAN = 90
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <span className={cn("truncate text-xs", strong ? "font-medium text-ink" : "text-ink-3")}>{label}</span>
      <div className="relative mr-10 h-6">
        <div className={cn("absolute inset-y-0 left-0 flex overflow-hidden rounded-r", !strong && "opacity-45")} style={{ width: `${(life / SPAN) * 100}%` }}>
          <span className="flex items-center justify-end bg-[#1a7a6b] pr-2 text-2xs font-medium tabular text-white" style={{ width: `${(healthy / life) * 100}%` }}>
            {formatYears(healthy)}
          </span>
          <span style={{ background: POOR_FILL }} className="ml-[2px] flex flex-1 items-center justify-end pr-2 text-2xs font-medium tabular text-[#3f4349]">
            {formatYears(life - healthy)}
          </span>
        </div>
        <span className="absolute top-1/2 -translate-y-1/2 pl-2 text-xs font-semibold tabular text-ink" style={{ left: `${(life / SPAN) * 100}%` }}>
          {formatYears(life)}
        </span>
      </div>
    </div>
  )
}

function summary(r: AreaReport): string {
  const m = r.male.now?.[0] ?? null
  const f = r.female.now?.[0] ?? null
  if (m === null || f === null) return `${r.name}: life expectancy figures from ONS.`
  const rel = (v: number, n: number | null) => {
    if (n === null) return ""
    const d = v - n
    if (Math.abs(d) < 0.05) return `the same as ${r.nation.name}`
    return `${formatYears(Math.abs(d))} years ${d > 0 ? "above" : "below"} ${r.nation.name}`
  }
  const change = r.male.change
  const trend =
    change === null
      ? ""
      : Math.abs(change) < 0.1
        ? " Male life expectancy is about where it was in 2011–13."
        : ` Since 2011–13, male life expectancy has ${change > 0 ? "risen" : "fallen"} by ${formatYears(Math.abs(change))} years.`
  return (
    `At current death rates, a boy born in ${r.name} can expect to live ${formatYears(m)} years and a girl ${formatYears(f)}: ` +
    `${rel(m, r.male.nationNow)} for men and ${rel(f, r.female.nationNow)} for women.` +
    trend
  )
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function decileWords(d: number): string {
  if (d === 1) return "most deprived tenth"
  if (d === 10) return "least deprived tenth"
  return `${ordinal(d)} most deprived tenth`
}
