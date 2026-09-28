# Ten years apart: the film

An animated companion to [Ten years apart](https://life-expectancy-uk.vercel.app/). The same story of UK life expectancy by place, told on one screen: 359 dots, one per local authority, morph from scene to scene instead of scrolling past.

## Controls

- Next and back: arrow keys, scroll, swipe, or the timeline at the bottom.
- **Play as a film** advances on its own.
- Time scenes have a period scrubber and replay button.
- **Men / Women** switches every figure; each sex has its own pair of extremes.
- **Follow a place** marks one local authority through every scene.

URL state: `#<scene>?sex=women&follow=<code>`.

## How it works

- `src/lib/compute.ts` derives every figure from the raw files in `data/` at build time.
- `src/film/engine.ts` is a keyed canvas motion engine: scenes list marks, text, lines and paths by id, and the engine tweens each property from where it is to where the next scene puts it.
- `src/film/scenes.ts` builds each scene; `src/film/copy.tsx` holds the captions.

## Data

`data/` holds copies of the processed ONS, OHID and hex-map files from the main project. Statistics and boundaries are reused under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); the hex layout is from Open Innovations (MIT).

## Develop

```bash
npm install
npm run dev     # http://localhost:3100
npm run lint
npm run build
```
