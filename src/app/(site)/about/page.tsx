import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Metadata } from "next"
import { ONS_LINKS } from "@/lib/explorer/catalogue"
import type { EvidenceFile } from "@/lib/explorer/evidence"
import { getFilmData } from "@/lib/film/data"

export const metadata: Metadata = { title: "Methods" }

async function loadEvidence(): Promise<EvidenceFile> {
  const file = path.join(process.cwd(), "public", "data", "evidence.json")
  return JSON.parse(await readFile(file, "utf-8")) as EvidenceFile
}

export default async function AboutPage() {
  const [evidence, film] = await Promise.all([loadEvidence(), getFilmData()])
  return (
    <article className="mx-auto w-full max-w-6xl pb-16 pt-10 sm:pt-14">
      <header className="max-w-3xl animate-rise">
        <p className="kicker">Methods</p>
        <h1 className="display mt-3 text-5xl text-ink sm:text-7xl">Sources and methods</h1>
        <p className="mt-6 text-xl leading-relaxed text-ink-2">
          UK figures come from official statistics, reused under the{" "}
          <a className="link" href={ONS_LINKS.ogl}>
            Open Government Licence v3.0
          </a>
          . OECD figures use CC BY 4.0. Numbers in the story and long version are computed from these files when the site is built.
        </p>
      </header>

      <Section title="Life expectancy">
        <p>
          ONS period life expectancy for UK local areas, three-year windows from 2001–03 to 2022–24, at birth and at age
          65, for males and females. A period figure summarises death rates in those years. It isn&apos;t a forecast of
          how long anyone born then will live.
        </p>
        <p>
          ONS doesn&apos;t test local differences for significance, so the area reports do. For a change or gap each report takes
          each figure&apos;s standard error from its 95% confidence interval (width ÷ 3.92) and calls the difference not
          significant when it is smaller than 1.96 times the combined standard error. That treats the two figures as
          independent; an area and its own nation aren&apos;t quite, which makes the area-versus-nation test slightly
          cautious. Overlapping intervals alone wouldn&apos;t show this: two intervals can overlap while the difference
          between them is still significant. City of London and the Isles of Scilly are left out of the
          ONS local series because their populations are small. English counties are a separate geography, so they are
          never ranked against districts.
        </p>
        <Links
          items={[
            ["Bulletin", ONS_LINKS.leBulletin],
            ["Dataset", ONS_LINKS.leDataset],
            ["National life tables", ONS_LINKS.nationalLifeTables],
          ]}
        />
      </Section>

      <Section title="The story's calculations">
        <p>
          <strong>Gap to the UK.</strong> Each place&apos;s life expectancy minus the UK figure for the same sex and
          period. Colours saturate at 4.5 years either side.
        </p>
        <p>
          <strong>The stall.</strong> Average yearly gain between period windows: (2011–13 minus 2001–03) ÷ 10, and
          (2017–19 minus 2011–13) ÷ 6. The dashed line extends the 2001–13 pace from 2011–13; it shows where the earlier
          trend would have led, not a forecast.
        </p>
        <p>
          <strong>Deprivation tenths.</strong> English local authorities ranked by IMD 2025 average score and cut into ten
          groups of equal count. The same 2025 grouping is used for every year, so &ldquo;most deprived&rdquo; means most
          deprived today. Group figures are simple means of areas, not weighted by population. This compares whole local
          authorities, each a mix of richer and poorer neighbourhoods, so its gap is narrower than ONS&apos;s figures for
          neighbourhoods grouped by deprivation. Both are valid; they answer different questions.
        </p>
        <p>
          <strong>Healthy years.</strong> The same method on upper-tier authorities, because healthy life expectancy
          isn&apos;t published for English districts.
        </p>
      </Section>

      <Section title="Healthy life expectancy">
        <p>
          Years lived in self-reported good or very good health, from the Annual Population Survey. ONS labels it
          official statistics in development, and its survey changed during the pandemic, so treat recent movements with
          care. In England it is published for upper-tier authorities only, so a district shows its county&apos;s figure.
        </p>
        <Links
          items={[
            ["Bulletin", ONS_LINKS.hleBulletin],
            ["Dataset", ONS_LINKS.hleDataset],
            ["Health Foundation analysis", ONS_LINKS.hleWatershed],
          ]}
        />
      </Section>

      <Section title="Avoidable deaths">
        <p>
          Age-standardised death rates from causes that are preventable through public health or treatable through
          timely healthcare, for people under 75. ONS publishes these for England and Wales only.
        </p>
        <Links
          items={[
            ["Bulletin", ONS_LINKS.avoidableBulletin],
            ["Dataset", ONS_LINKS.avoidableDataset],
          ]}
        />
      </Section>

      <Section title="Deprivation">
        <p>
          English Indices of Deprivation 2025, local authority summaries. Wales, Scotland and Northern Ireland each have
          their own index. Their ranks can&apos;t be compared with England&apos;s, so they aren&apos;t included. The index
          includes a health domain that counts early deaths, so part of its link with life expectancy is built in. The
          story sets child poverty, which has no health component, alongside it.
        </p>
        <Links items={[["IoD 2025", ONS_LINKS.iod]]} />
      </Section>

      <Section title="Local indicators">
        <p>
          {evidence.indicators.length} indicators from{" "}
          <a className="link" href={evidence.meta.url}>
            OHID Fingertips
          </a>
          , England only, fetched {evidence.meta.fetched}. Each uses the latest period with values for at least 90% of
          local authorities (80% for drug deaths, where small counts are suppressed). Correlations are Pearson r across
          local authorities, each area counted once regardless of population.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-ink text-left">
                <th className="py-2.5 pr-3 font-semibold text-ink">Indicator</th>
                <th className="hidden px-3 py-2.5 font-semibold text-ink sm:table-cell">Group</th>
                <th className="px-3 py-2.5 font-semibold text-ink">Period</th>
                <th className="py-2.5 pl-3 font-semibold text-ink">Unit</th>
              </tr>
            </thead>
            <tbody>
              {evidence.indicators.map((indicator) => (
                <tr key={indicator.key} className="border-b border-line">
                  <td className="py-2.5 pr-3">
                    <a className="link" href={indicator.url}>
                      {indicator.label}
                    </a>
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink-2 sm:table-cell">{indicator.group}</td>
                  <td className="mono whitespace-nowrap px-3 py-2.5 text-[13px] text-ink-2">{indicator.period}</td>
                  <td className="py-2.5 pl-3 text-ink-2">{indicator.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Correlation between areas isn&apos;t causation, and it says nothing about individuals. Deprivation, smoking,
          obesity and early deaths move together, so their links with life expectancy overlap rather than add up.
          OHID&apos;s{" "}
          <a className="link" href={ONS_LINKS.segment}>
            Segment tool
          </a>{" "}
          splits the deprivation gap in life expectancy by cause of death.
        </p>
      </Section>

      <Section title="International comparisons">
        <p>
          {film.intl.countries.length} OECD members, with life expectancy at birth for men and women in single calendar years,
          {film.intl.years[0]} to {film.intl.years.at(-1)}. Fetched {film.intl.fetched}. These figures differ slightly from the ONS
          three-year estimates used elsewhere.
        </p>
        <p>
          The OECD average counts each member equally. Latvia&apos;s missing 2001 value and Türkiye&apos;s missing 2024 value
          use their nearest available year in the average. Other missing values remain gaps. Countries with equal published
          values share a rank.
        </p>
        <p>
          Annual gains use least-squares trends over 2001–11 and 2011–19. The comparison of starting levels uses 2011 life
          expectancy against the trend gain to 2019. Its fitted line describes the relationship across countries, not a target.
          Peers starting within a year of the UK are compared separately.
        </p>
        <Links items={[
          ["OECD Health Statistics", "https://data-explorer.oecd.org/"],
          ["Data used by the story", "/data/intl.json"],
          ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
        ]} />
      </Section>

      <Section title="Maps and code">
        <p>
          Boundaries from the ONS Open Geography Portal (contains OS data © Crown copyright and database right). The hex
          layout in the story is{" "}
          <a className="link" href="https://github.com/odileeds/hexmaps">
            Open Innovations&apos; UK local authority hex map
          </a>{" "}
          (MIT licence). Postcode search uses postcodes.io. Processing scripts are in the{" "}
          <a className="link" href="https://github.com/EddieDavison92/ten-years-apart">
            GitHub repository
          </a>
          .
        </p>
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 grid grid-cols-1 gap-6 border-t border-line pt-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
      <h2 className="display text-3xl text-ink">{title}</h2>
      <div className="max-w-3xl space-y-4 text-[17px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  )
}

function Links({ items }: { items: [string, string][] }) {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map(([label, href]) => (
        <a key={href} className="link" href={href}>
          {label} ↗
        </a>
      ))}
    </p>
  )
}
