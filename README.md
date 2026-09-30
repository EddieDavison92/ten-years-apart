# Ten years apart

How long people live across the UK's local authorities, how progress stalled after 2011, and how the gap between places has grown. Live at [www.ten-years-apart.uk](https://www.ten-years-apart.uk/).

UK statistics and boundaries are reused under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). OECD statistics use CC BY 4.0; the Open Innovations hex layout uses the MIT licence.

## Pages

- **Film** (`/`): eight chapters and 22 scenes. The same dots move through the gap between places, the stall after 2011, the UK among OECD members, deprivation, healthy years and local circumstances. Controls include autoplay, arrow keys, scroll, swipe, a men/women switch and following a place.
- **Long version** (`/story`): the original scrolling data essay, retained as an archive.
- **Area reports** (`/area/[code]`): a statically generated page for every local authority and English county.
- **Atlas** (`/explore`): full-screen map of every measure and period, with a histogram legend and period player.
- **Evidence** (`/evidence`): the deprivation gradient, correlation of 15 OHID indicators with life expectancy, and a scatter per indicator.
- **Methods** (`/about`): sources and calculations.

Atlas URL state: `?metric=&geo=&area=&year=&sex=&age=&view=`.

Film URL state: `?sex=women&follow=<code>#<scene>`.

The film has its own full-screen layout. Routes in `src/app/(site)/` share the header and footer without changing their public URLs.

## Data

| File | Source | Build |
| --- | --- | --- |
| `public/data/le.json`, `hle.json`, `avoidable.json`, `deprivation.json`, `lookups.json` | ONS, MHCLG | `scripts/build-explorer-data.py` (needs the original extracts in `uploads/`) |
| `public/data/evidence.json` | OHID Fingertips API, England only | `python scripts/build-evidence-data.py` |
| `public/data/hex.json` | Open Innovations hex map (MIT) | `python scripts/build-hex-layout.py` |
| `public/geo/*.geojson` | ONS Open Geography, simplified | `scripts/build-explorer-data.py` |
| `public/data/intl.json` | OECD Health Statistics, life expectancy at birth for 38 members | `node scripts/build-intl.mjs` |

Processed JSON is committed, so a normal checkout doesn't need a rebuild. The evidence script caches raw CSVs in `.cache/ft`; delete it to refresh.

The film and supporting pages read the same UK files in `public/data/`. `src/lib/film/compute.ts` derives the film's figures at build time; `src/film/` holds its player, canvas engine, scenes and captions.

## Repository and deployment

Develop both the film and supporting pages in [EddieDavison92/ten-years-apart](https://github.com/EddieDavison92/ten-years-apart). The former `ten-years-apart-film` checkout is an archive. Its history through `e5096d0` is retained in this repository's merge history.

One Vercel project, `ten-years-apart`, deploys this repository's `master` branch from the repository root. Feature branches receive preview deployments. The production domains remain `www.ten-years-apart.uk`, `ten-years-apart.uk` (redirects to `www`) and `life-expectancy-uk.vercel.app`.

Vercel and CI use Node 24. `vercel.json` pins the Next.js framework, `npm ci` installation and `npm run build`. The build also copies the MapLibre worker for the atlas.

To link a fresh local checkout to the existing project:

```bash
vercel link --project ten-years-apart --scope eddiedavisons-projects
```

Push a feature branch and check its Vercel preview before merging to `master`. Do not create another Vercel project for the film. Merge the film import PR with a merge commit to retain both repositories' histories.

## Develop

```bash
node --version # 24.x
npm install
npm run dev
npm run lint
npm run build
```
