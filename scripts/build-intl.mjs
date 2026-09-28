// Fetches life expectancy at birth by sex for the 38 OECD members from OECD Health Statistics
// and writes data/intl.json. Run: node scripts/build-intl.mjs
import { writeFile } from "node:fs/promises"

const URL_CSV =
  "https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE,1.1/all?startPeriod=2001&format=csvfilewithlabels"

/** OECD members, 2026. */
const MEMBERS = {
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  CAN: "Canada",
  CHL: "Chile",
  COL: "Colombia",
  CRI: "Costa Rica",
  CZE: "Czechia",
  DNK: "Denmark",
  EST: "Estonia",
  FIN: "Finland",
  FRA: "France",
  DEU: "Germany",
  GRC: "Greece",
  HUN: "Hungary",
  ISL: "Iceland",
  IRL: "Ireland",
  ISR: "Israel",
  ITA: "Italy",
  JPN: "Japan",
  KOR: "Korea",
  LVA: "Latvia",
  LTU: "Lithuania",
  LUX: "Luxembourg",
  MEX: "Mexico",
  NLD: "Netherlands",
  NZL: "New Zealand",
  NOR: "Norway",
  POL: "Poland",
  PRT: "Portugal",
  SVK: "Slovakia",
  SVN: "Slovenia",
  ESP: "Spain",
  SWE: "Sweden",
  CHE: "Switzerland",
  TUR: "Türkiye",
  GBR: "United Kingdom",
  USA: "United States",
}
const FROM = 2001

/** Minimal CSV parser for the quoted SDMX export. */
function parse(text) {
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  const [head, ...body] = rows
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const res = await fetch(URL_CSV)
if (!res.ok) throw new Error(`OECD: ${res.status}`)
const rows = parse(await res.text()).filter((r) => r.MEASURE === "LFEXP" && r.AGE === "Y0" && (r.SEX === "M" || r.SEX === "F") && MEMBERS[r.REF_AREA])

const values = {}
let last = 0
for (const r of rows) {
  if (r.OBS_VALUE === "") continue
  const year = Number(r.TIME_PERIOD)
  const sex = r.SEX === "M" ? "male" : "female"
  ;((values[r.REF_AREA] ??= { male: {}, female: {} })[sex])[year] = Number(r.OBS_VALUE)
  last = Math.max(last, year)
}
// Stop at the last year most members report; later gaps stay null.
const reporting = (y) => Object.values(values).filter((v) => v.male[y] !== undefined).length
while (reporting(last) < Object.keys(MEMBERS).length * 0.8) last -= 1

const years = []
for (let y = FROM; y <= last; y += 1) years.push(y)
const countries = Object.entries(MEMBERS).map(([code, name]) => ({
  code,
  name,
  male: years.map((y) => values[code]?.male[y] ?? null),
  female: years.map((y) => values[code]?.female[y] ?? null),
}))

await writeFile(
  new URL("../data/intl.json", import.meta.url),
  JSON.stringify({
    meta: {
      source: "OECD Health Statistics: life expectancy at birth, by sex",
      url: "https://data-explorer.oecd.org/",
      licence: "CC BY 4.0",
      fetched: new Date().toISOString().slice(0, 10),
      note: "Single calendar years as reported by each country. Gaps are null.",
    },
    years,
    countries,
  })
)
console.log(`${countries.length} members, ${years[0]}–${years.at(-1)}`)
