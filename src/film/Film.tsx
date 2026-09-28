"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { copyFor } from "@/film/copy"
import { CHAPTERS, SCENES, timeRange, type SceneDef } from "@/film/scenes"
import { Stage, type Hover, type StageHandle } from "@/film/Stage"
import { Mark, PlaceSearch, Ruler, SexToggle, TimeBar, type TimeBarHandle } from "@/film/ui"
import type { Box } from "@/film/geo"
import type { FilmData, Sex } from "@/lib/compute"
import { cn } from "@/lib/cn"
import { signed, years } from "@/lib/format"

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]
const LONG_READ = "https://life-expectancy-uk.vercel.app/"

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb)
  return () => window.removeEventListener("resize", cb)
}

/** Viewport size, or 0x0 before hydration. */
function useViewport() {
  const key = useSyncExternalStore(
    subscribe,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "0x0"
  )
  return key.split("x").map(Number) as [number, number]
}

export type Layout = {
  wide: boolean
  narrow: boolean
  side: number
  header: number
  rail: number
  capW: number
  capH: number
  box: Box
}

/** Wide screens put the caption in a left column; others stack the stage over a caption sheet. */
function layoutFor(W: number, H: number, opening = false): Layout {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  if (W >= 1024 && H >= 600) {
    const side = W >= 1440 ? 64 : 44
    const capW = Math.round(clamp(W * 0.29, 340, 440))
    const header = 72
    const rail = 84
    const x = side + capW + (W >= 1440 ? 88 : 60)
    return { wide: true, narrow: false, side, header, rail, capW, capH: 0, box: { x, y: header + 52, w: W - x - side, h: H - header - 52 - rail - 70 } }
  }
  const header = 56
  const rail = 60
  // The opening caption carries the title, so it gets more room.
  const capH = Math.round(opening ? clamp(H * 0.5, 300, 440) : clamp(H * 0.36, 200, 320))
  const side = W < 640 ? 16 : 28
  return { wide: false, narrow: W < 640, side, header, rail, capW: W, capH, box: { x: side, y: header + 38, w: W - side * 2, h: H - header - 38 - capH - rail - 46 } }
}

/** How long autoplay holds a scene: its time sweep plus reading time. */
function holdFor(s: SceneDef) {
  if (s.factors) return 3800 * 5 + 2500
  if (s.time && s.time.ms) return (s.time.delay ?? 0) + s.time.ms + 5200
  return s.id === "open" ? 7500 : 8500
}

function readInitial(data: FilmData) {
  const url = new URL(window.location.href)
  const i = SCENES.findIndex((s) => `#${s.id}` === url.hash)
  const sex: Sex = url.searchParams.get("sex") === "women" ? "female" : "male"
  const f = url.searchParams.get("follow")
  return { index: Math.max(0, i), sex, follow: f && data.areas.some((a) => a.code === f) ? f : null }
}

export function Film({ data }: { data: FilmData }) {
  const [W, H] = useViewport()
  if (!W) return <div className="h-dvh bg-paper" />
  return <Player data={data} W={W} H={H} />
}

function Player({ data, W, H }: { data: FilmData; W: number; H: number }) {
  const [initial] = useState(() => readInitial(data))
  const [index, setIndex] = useState(initial.index)
  const [dir, setDir] = useState<1 | -1>(1)
  const [sex, setSex] = useState<Sex>(initial.sex)
  const [follow, setFollow] = useState<string | null>(initial.follow)
  const [factor, setFactor] = useState(1)
  const [cycling, setCycling] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const stage = useRef<StageHandle | null>(null)
  const bar = useRef<TimeBarHandle | null>(null)
  const indexRef = useRef(index)
  const wheel = useRef({ acc: 0, lock: 0, last: 0 })
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const scene = SCENES[index]
  const lay = layoutFor(W, H, scene.id === "open")
  const places = useMemo(() => data.areas.map((a) => ({ code: a.code, name: a.name })).sort((a, b) => a.name.localeCompare(b.name)), [data.areas])

  useEffect(() => {
    indexRef.current = index
  })

  const go = (to: number) => {
    const cur = indexRef.current
    const n = Math.max(0, Math.min(SCENES.length - 1, to))
    if (n === cur) return
    indexRef.current = n
    setDir(n > cur ? 1 : -1)
    setIndex(n)
    setHover(null)
    if (SCENES[n].factors) {
      setFactor(1)
      setCycling(true)
    }
  }
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })

  // Keep the URL shareable.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.hash = SCENES[index].id
    if (sex === "female") url.searchParams.set("sex", "women")
    else url.searchParams.delete("sex")
    if (follow) url.searchParams.set("follow", follow)
    else url.searchParams.delete("follow")
    window.history.replaceState(null, "", url)
  }, [index, sex, follow])

  // Follow links to a scene's hash.
  useEffect(() => {
    const onHash = () => {
      const i = SCENES.findIndex((s) => `#${s.id}` === window.location.hash)
      if (i >= 0) goRef.current(i)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const i = indexRef.current
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        if (e.key === "Enter" && el?.tagName === "BUTTON") return
        if (e.key === " " && el?.tagName === "BUTTON") return
        goRef.current(i + 1)
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) goRef.current(i - 1)
      else if (e.key === "Home") goRef.current(0)
      else if (e.key === "End") goRef.current(SCENES.length - 1)
      else return
      e.preventDefault()
      setPlaying(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Autoplay: hold each scene, then move on.
  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => {
      if (indexRef.current >= SCENES.length - 1) setPlaying(false)
      else goRef.current(indexRef.current + 1)
    }, holdFor(SCENES[index]))
    return () => window.clearTimeout(id)
  }, [playing, index])

  // Cycle circumstances until the reader picks one.
  useEffect(() => {
    if (!scene.factors || !cycling) return
    const id = window.setInterval(() => setFactor((f) => Math.min(data.factors.length - 1, f + 1)), 3800)
    return () => window.clearInterval(id)
  }, [scene.factors, cycling, data.factors.length])

  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest("[data-scroll]")) return
    const w = wheel.current
    const now = performance.now()
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    // Trackpads keep sending events after a swipe; any event during the lock extends it.
    if (now < w.lock) {
      w.lock = Math.max(w.lock, now + 180)
      return
    }
    if (now - w.last > 220) w.acc = 0
    w.last = now
    w.acc += e.deltaMode === 1 ? d * 30 : d
    if (Math.abs(w.acc) > 36) {
      go(indexRef.current + (w.acc > 0 ? 1 : -1))
      setPlaying(false)
      w.acc = 0
      w.lock = now + 750
    }
  }

  const copy = copyFor(scene.id, { data, sex, factor })
  const hovered = hover ? data.areas[hover.index] : null
  const [t0, t1] = timeRange(lay.box, lay.narrow)
  const chapter = scene.chapter
  const capKey = `${scene.id}:${sex}:${scene.factors ? (data.factors[factor]?.key === "airPollution" ? "air" : factor) : ""}`

  const caption = (
    <CaptionBody
      scene={scene}
      copy={copy}
      wide={lay.wide}
      extra={
        scene.id === "open" ? (
          <Begin onBegin={() => go(1)} onPlay={() => setPlaying(true)} wide={lay.wide} />
        ) : scene.factors ? (
          <FactorChips
            factors={data.factors.map((f) => f.short)}
            value={factor}
            onChange={(f) => {
              setCycling(false)
              setFactor(f)
            }}
          />
        ) : scene.id === "close" ? (
          <Close places={places} follow={follow} onFollow={setFollow} onRestart={() => go(0)} />
        ) : null
      }
    />
  )

  return (
    <div
      className="relative h-dvh w-full select-none overflow-hidden bg-paper"
      onWheel={onWheel}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest("[data-scroll],button,input,[role=slider]")) return
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
      }}
      onTouchEnd={(e) => {
        const s = touch.current
        touch.current = null
        if (!s) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (performance.now() - s.t > 900 || Math.max(Math.abs(dx), Math.abs(dy)) < 44) return
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy
        go(indexRef.current + (d < 0 ? 1 : -1))
        setPlaying(false)
      }}
    >
      <Stage
        ref={stage}
        scene={scene}
        data={data}
        sex={sex}
        follow={follow}
        factor={scene.factors ? factor : 0}
        dir={dir}
        W={W}
        H={H}
        box={lay.box}
        narrow={lay.narrow}
        onHover={setHover}
        onTime={(t, p) => bar.current?.set(t, p)}
        onTimeDone={() => {}}
      />

      {scene.time ? (
        <TimeBar
          key={scene.id}
          ref={bar}
          periods={data.periods}
          left={t0}
          width={t1 - t0}
          top={lay.box.y + lay.box.h + (lay.narrow ? 16 : 24)}
          onScrub={(t) => {
            setPlaying(false)
            stage.current?.scrub(t)
          }}
          onReplay={() => stage.current?.replay()}
        />
      ) : null}

      {hovered && hover ? <Tooltip area={hovered} hover={hover} data={data} sex={sex} scene={scene} factor={factor} W={W} /> : null}

      {/* Header */}
      <header
        className="absolute inset-x-0 top-0 z-30 flex items-center gap-3"
        style={{ height: lay.header, paddingLeft: lay.side, paddingRight: lay.side }}
      >
        <button type="button" onClick={() => go(0)} className="flex items-center gap-2.5 whitespace-nowrap" aria-label="Ten years apart, back to the start">
          <Mark />
          <span className={cn("display text-[19px] text-ink", lay.narrow && "hidden")}>Ten years apart</span>
        </button>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {lay.narrow ? (
            <button
              type="button"
              aria-label="Follow a place"
              onClick={() => setSearchOpen((o) => !o)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-white/70",
                (searchOpen || follow) && "border-ink/40"
              )}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ink" aria-hidden>
                <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <PlaceSearch places={places} value={follow} onChange={setFollow} />
          )}
          <SexToggle value={sex} onChange={setSex} compact={lay.narrow} />
        </div>
      </header>
      {lay.narrow && searchOpen ? (
        <div className="absolute inset-x-4 z-40 [animation:menu_180ms_ease-out]" style={{ top: lay.header }}>
          <PlaceSearch
            places={places}
            value={follow}
            autoFocus
            onChange={(c) => {
              setFollow(c)
              if (c) setSearchOpen(false)
            }}
          />
        </div>
      ) : null}

      {/* Caption */}
      {lay.wide ? (
        <div className="absolute z-20 flex flex-col justify-center" style={{ left: lay.side, top: lay.header, bottom: lay.rail, width: lay.capW }}>
          <Crossfade id={capKey}>{caption}</Crossfade>
        </div>
      ) : (
        <div
          data-scroll
          className="no-scrollbar absolute inset-x-0 z-20 overflow-y-auto border-t border-ink/[0.07] bg-paper/95 backdrop-blur-sm transition-[height] duration-700 ease-[cubic-bezier(0.65,0,0.25,1)]"
          style={{ bottom: lay.rail, height: lay.capH, paddingLeft: lay.side + 4, paddingRight: lay.side + 4 }}
        >
          <div className="pb-5 pt-4">
            <Crossfade id={capKey}>{caption}</Crossfade>
          </div>
        </div>
      )}

      <Rail
        index={index}
        onGo={(i) => {
          go(i)
          setPlaying(false)
        }}
        playing={playing}
        onPlay={() => {
          if (!playing && indexRef.current >= SCENES.length - 1) go(0)
          setPlaying((p) => !p)
        }}
        lay={lay}
        chapter={chapter}
      />
    </div>
  )
}

/** Keeps the outgoing caption long enough to fade while the next one rises. */
function Crossfade({ id, children }: { id: string; children: ReactNode }) {
  const [shown, setShown] = useState<{ id: string; node: ReactNode }>({ id, node: children })
  const [gone, setGone] = useState<{ id: string; node: ReactNode } | null>(null)
  if (shown.id !== id) {
    setGone(shown)
    setShown({ id, node: children })
  }
  useEffect(() => {
    if (!gone) return
    const t = window.setTimeout(() => setGone(null), 420)
    return () => window.clearTimeout(t)
  }, [gone])
  return (
    <div className="grid">
      {gone ? (
        <div key={gone.id} aria-hidden className="cap-out pointer-events-none [grid-area:1/1]">
          {gone.node}
        </div>
      ) : null}
      <div key={id} className={cn("[grid-area:1/1]", gone ? "cap-in cap-wait" : "cap-in")} aria-live="polite">
        {children}
      </div>
    </div>
  )
}

function CaptionBody({ scene, copy, wide, extra }: { scene: SceneDef; copy: ReturnType<typeof copyFor>; wide: boolean; extra: ReactNode }) {
  const open = scene.id === "open"
  return (
    <div className="cap">
      {open ? (
        <>
          <p className="kicker">Life expectancy across the UK · 2001–2024</p>
          <h1 className={cn("display text-ink", wide ? "mt-6 text-[clamp(3.4rem,5.2vw,5.6rem)] leading-[0.9]" : "mt-2 text-[2.6rem] leading-[0.92]")}>
            <span className="block whitespace-nowrap">Ten years</span>
            <span className="mt-[0.06em] flex items-center gap-[0.18em]">
              <Ruler />
              <span>apart</span>
            </span>
          </h1>
        </>
      ) : (
        <>
          <p className="kicker">
            <span className="text-ink">{ROMAN[scene.chapter]}</span>
            <span className="mx-2 text-ink-4">·</span>
            {CHAPTERS[scene.chapter]}
          </p>
          <h2 className={cn("display text-ink", wide ? "mt-4 text-[clamp(2.1rem,2.9vw,3.1rem)] leading-[1.02]" : "mt-1.5 text-[1.7rem] leading-[1.05]")}>
            {copy.title}
          </h2>
        </>
      )}
      <p className={cn("text-ink-2", wide ? (open ? "mt-7 text-[17.5px] leading-[1.6]" : "mt-5 text-[17px] leading-[1.6]") : "mt-2.5 text-[15px] leading-[1.55]")}>
        {copy.body}
      </p>
      {copy.stat ? (
        <div className={cn("border-t-2 border-ink pt-2", wide ? "mt-7" : "mt-4")}>
          <p className={cn("display text-ink", wide ? "text-[4.2rem] leading-none" : "text-5xl")}>{copy.stat.value}</p>
          <p className="mt-1.5 text-[12px] text-ink-3">{copy.stat.label}</p>
        </div>
      ) : null}
      {copy.note ? <p className={cn("border-l-2 border-ink/80 pl-3 text-ink-3", wide ? "mt-6 text-[13.5px] leading-relaxed" : "mt-3 text-[12.5px] leading-snug")}>{copy.note}</p> : null}
      {extra ? <div className={wide ? "mt-8" : "mt-4"}>{extra}</div> : null}
    </div>
  )
}

function Begin({ onBegin, onPlay, wide }: { onBegin: () => void; onPlay: () => void; wide: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <button
        type="button"
        onClick={onBegin}
        className="group flex items-center gap-3 rounded-full bg-ink py-2.5 pl-5 pr-4 text-[14px] font-semibold text-paper shadow-[0_12px_28px_-14px_rgba(17,19,21,0.7)] transition hover:bg-[#23272b]"
      >
        Begin
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden>
          <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={onPlay} className="flex items-center gap-2 text-[13.5px] font-medium text-ink-2 transition hover:text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/20">
          <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5" aria-hidden>
            <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
          </svg>
        </span>
        Play as a film
      </button>
      {wide ? <p className="w-full text-[12.5px] text-ink-3">Or scroll, swipe or use the arrow keys.</p> : null}
    </div>
  )
}

function FactorChips({ factors, value, onChange }: { factors: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Circumstance">
      {factors.map((f, i) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={i === value}
          onClick={() => onChange(i)}
          className={cn(
            "rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-300",
            i === value ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white/60 text-ink-2 hover:border-ink/35 hover:text-ink"
          )}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function Close({ places, follow, onFollow, onRestart }: { places: { code: string; name: string }[]; follow: string | null; onFollow: (c: string | null) => void; onRestart: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="kicker mb-2">{follow ? "Following" : "Find your place"}</p>
        <PlaceSearch places={places} value={follow} onChange={onFollow} placeholder="Type a local authority" />
        <p className="mt-2 text-[12.5px] text-ink-3">It stays marked if you watch again.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] font-medium">
        <button type="button" onClick={onRestart} className="flex items-center gap-2 text-ink transition hover:text-ink-2">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path d="M3 8a5 5 0 1 0 1.46-3.54M3 3v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Watch again
        </button>
        <a href={LONG_READ} className="text-ink-2 underline decoration-ink/25 underline-offset-4 transition hover:text-ink hover:decoration-ink">
          Read the long version
        </a>
      </div>
    </div>
  )
}

function Rail({ index, onGo, playing, onPlay, lay, chapter }: { index: number; onGo: (i: number) => void; playing: boolean; onPlay: () => void; lay: Layout; chapter: number }) {
  const hold = holdFor(SCENES[index])
  const groups = CHAPTERS.map((name, ci) => ({ name, ci, scenes: SCENES.map((s, i) => ({ s, i })).filter(({ s }) => s.chapter === ci) }))
  const segment = (i: number) => (
    <button
      key={i}
      type="button"
      onClick={() => onGo(i)}
      aria-label={`Scene ${i + 1}`}
      aria-current={i === index ? "step" : undefined}
      className="group relative flex h-6 flex-1 items-center"
    >
      <span className={cn("relative h-[3px] w-full overflow-hidden rounded-full transition-colors duration-500", i < index ? "bg-ink/45" : i === index ? "bg-ink/15" : "bg-ink/10 group-hover:bg-ink/25")}>
        {i === index ? (
          <span
            key={`${i}:${playing}`}
            className="absolute inset-0 origin-left rounded-full bg-ink"
            style={playing ? { animation: `grow ${hold}ms linear both` } : undefined}
          />
        ) : null}
      </span>
    </button>
  )
  const arrows = (
    <div className="flex items-center gap-1.5">
      <RoundButton label="Previous" onClick={() => onGo(index - 1)} disabled={index === 0}>
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </RoundButton>
      <span className="tabular w-12 text-center text-[12px] text-ink-3">
        <span className="text-ink">{String(index + 1).padStart(2, "0")}</span> / {SCENES.length}
      </span>
      <RoundButton label="Next" onClick={() => onGo(index + 1)} disabled={index === SCENES.length - 1} strong>
        <path d="M6 3.5 10.5 8 6 12.5" />
      </RoundButton>
    </div>
  )
  return (
    <nav
      aria-label="Scenes"
      className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-ink/[0.07] bg-paper/90 backdrop-blur-sm"
      style={{ height: lay.rail, paddingLeft: lay.side, paddingRight: lay.side }}
    >
      <RoundButton label={playing ? "Pause" : "Play as a film"} onClick={onPlay}>
        {playing ? <path d="M6 4v8M10 4v8" /> : <path d="M5.5 3.5v9l7-4.5z" fill="currentColor" />}
      </RoundButton>
      {lay.wide ? (
        <ol className="flex flex-1 gap-4">
          {groups.map((g) => (
            <li key={g.name} className="min-w-0" style={{ flex: `${g.scenes.length} 1 auto` }}>
              <button
                type="button"
                onClick={() => onGo(g.scenes[0].i)}
                className={cn("kicker block max-w-full truncate whitespace-nowrap text-left transition-colors", g.ci === chapter ? "!text-ink" : "!text-ink-4 hover:!text-ink-2")}
              >
                <span className="mr-1.5">{ROMAN[g.ci]}</span>
                {g.name}
              </button>
              <div className="mt-0.5 flex gap-1">{g.scenes.map(({ i }) => segment(i))}</div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-1 gap-[3px]">{SCENES.map((_, i) => segment(i))}</div>
      )}
      {arrows}
    </nav>
  )
}

function RoundButton({ label, onClick, disabled, strong, children }: { label: string; onClick: () => void; disabled?: boolean; strong?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-30",
        strong ? "border-ink bg-ink text-paper hover:bg-[#23272b]" : "border-ink/15 bg-white/70 text-ink hover:border-ink/40"
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  )
}

function Tooltip({ area, hover, data, sex, scene, factor, W }: { area: FilmData["areas"][number]; hover: Hover; data: FilmData; sex: Sex; scene: SceneDef; factor: number; W: number }) {
  const now = data.index.now
  const stall = data.index.stall
  const ch = (s: Sex) => (area[s][now] !== null && area[s][stall] !== null ? (area[s][now] as number) - (area[s][stall] as number) : null)
  const f = scene.id === "poverty" ? data.factors[0] : scene.factors ? data.factors[factor] : null
  const left = hover.x + 16 + 220 > W ? hover.x - 16 - 220 : hover.x + 16
  return (
    <div
      className="pointer-events-none absolute z-40 w-[220px] rounded-2xl border border-ink/10 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(17,19,21,0.5)] backdrop-blur [animation:menu_140ms_ease-out]"
      style={{ left, top: Math.max(8, hover.y - 64) }}
    >
      <p className="text-[14px] font-semibold leading-tight text-ink">{area.name}</p>
      <dl className="tabular mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[12px] text-ink-2">
        <dt className="text-ink-3">Life expectancy</dt>
        <dd className="text-right text-ink-3">Men</dd>
        <dd className="text-right text-ink-3">Women</dd>
        <dt>{data.periods[now]}</dt>
        <dd className={cn("text-right", sex === "male" ? "font-semibold text-ink" : "")}>{years(area.male[now])}</dd>
        <dd className={cn("text-right", sex === "female" ? "font-semibold text-ink" : "")}>{years(area.female[now])}</dd>
        <dt>Since {data.periods[stall]}</dt>
        <dd className="text-right">{signed(ch("male"))}</dd>
        <dd className="text-right">{signed(ch("female"))}</dd>
      </dl>
      {area.decile || (f && area.f[f.key] !== null) ? (
        <p className="mt-2 border-t border-ink/10 pt-2 text-[12px] text-ink-2">
          {area.decile ? <>Deprivation tenth {area.decile} of 10</> : null}
          {f && area.f[f.key] !== null ? (
            <>
              {area.decile ? <br /> : null}
              {f.short}: {years(area.f[f.key], f.decimals)}
              {f.unit === "%" ? "%" : ""}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
