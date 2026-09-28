"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { copyFor, Methods } from "@/film/copy"
import { CHAPTERS, SCENES, timeOf, timeRange, type SceneDef } from "@/film/scenes"
import { Stage, type Hover, type StageHandle } from "@/film/Stage"
import { Mark, PlaceSearch, Ruler, SexToggle, TimeBar, type TimeBarHandle } from "@/film/ui"
import type { Box } from "@/film/geo"
import type { FilmData, Sex } from "@/lib/compute"
import { cn } from "@/lib/cn"
import { signed, years } from "@/lib/format"

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
const LONG_READ = "https://life-expectancy-uk.vercel.app/"
/** Circumstances hold this long each while the scene cycles through them. */
const CYCLE_MS = 3400

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
  /** wide: caption column on a desktop; side: caption column on a landscape phone or tablet; stacked: caption sheet below. */
  mode: "wide" | "side" | "stacked"
  narrow: boolean
  side: number
  header: number
  rail: number
  capW: number
  capH: number
  box: Box
  /** Where the stage may draw, so marks don't cross the caption. */
  clip: Box
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function layoutFor(W: number, H: number, opening = false): Layout {
  if (W >= 1024 && H >= 600) {
    const side = W >= 1440 ? 64 : 44
    const capW = Math.round(clamp(W * 0.29, 340, 440))
    const header = 72
    const rail = 84
    const x = side + capW + (W >= 1440 ? 88 : 60)
    const box = { x, y: header + 52, w: W - x - side, h: H - header - 52 - rail - 70 }
    return { mode: "wide", narrow: false, side, header, rail, capW, capH: 0, box, clip: { x: x - 56, y: header, w: W - x + 56, h: H - header - rail } }
  }
  if (W > H && W >= 640) {
    const side = 20
    const capW = Math.round(clamp(W * 0.36, 250, 380))
    const header = 52
    const rail = 56
    const x = side + capW + 28
    const box = { x, y: header + 32, w: W - x - side, h: Math.max(120, H - header - 32 - rail - 44) }
    return { mode: "side", narrow: box.w < 560 || box.h < 320, side, header, rail, capW, capH: 0, box, clip: { x: x - 40, y: header, w: W - x + 40, h: H - header - rail } }
  }
  const header = 56
  const rail = 60
  const side = W < 640 ? 16 : 28
  // The opening caption carries the title, so it gets more room; the stage keeps at least 170 px.
  const want = opening ? clamp(H * 0.5, 300, 440) : clamp(H * 0.36, 200, 320)
  const capH = Math.round(Math.max(150, Math.min(want, H - header - 38 - rail - 46 - 170)))
  const box = { x: side, y: header + 38, w: W - side * 2, h: H - header - 38 - capH - rail - 46 }
  return { mode: "stacked", narrow: W < 640, side, header, rail, capW: W, capH, box, clip: { x: 0, y: header, w: W, h: H - header - rail - capH } }
}

/** How long autoplay holds a scene: its time sweep plus reading time. */
function holdFor(s: SceneDef) {
  if (s.factors) return CYCLE_MS * 8 + 2500
  if (s.time && s.time.ms) return (s.time.delay ?? 0) + s.time.ms + 5200
  return s.id === "open" ? 8000 : 8500
}

function readInitial(data: FilmData) {
  const url = new URL(window.location.href)
  const i = SCENES.findIndex((s) => `#${s.id}` === url.hash)
  const sex: Sex = url.searchParams.get("sex") === "women" ? "female" : "male"
  const f = url.searchParams.get("follow")
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return { index: Math.max(0, i), sex, follow: f && data.areas.some((a) => a.code === f) ? f : null, reduce }
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
  const [cycling, setCycling] = useState(!initial.reduce && Boolean(SCENES[initial.index].factors))
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const stage = useRef<StageHandle | null>(null)
  const bar = useRef<TimeBarHandle | null>(null)
  const methods = useRef<HTMLDialogElement | null>(null)
  const capRef = useRef<HTMLDivElement | null>(null)
  const indexRef = useRef(index)
  const wheel = useRef({ acc: 0, lock: 0, last: 0 })
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const scene = SCENES[index]
  const lay = layoutFor(W, H, scene.id === "open")
  const compact = lay.mode !== "wide"
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
      setCycling(!initial.reduce)
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

  // A control that caused the scene change may have gone with the old caption; keep focus in the caption.
  useEffect(() => {
    const el = document.activeElement
    if (!el || el === document.body) capRef.current?.focus({ preventScroll: true })
  }, [index])

  // Follow links to a scene's hash.
  useEffect(() => {
    const onHash = () => {
      const i = SCENES.findIndex((s) => `#${s.id}` === window.location.hash)
      if (i >= 0) goRef.current(i)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  // Keyboard. Controls with their own keys (links, inputs, sliders, radio groups, the dialog) keep them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector("dialog[open]")) return
      if (el?.closest("input, textarea, select, a, [contenteditable=true], [role=slider], [role=radio], [role=combobox], [role=listbox]")) return
      const nav = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "ArrowLeft", "ArrowUp", "PageUp", "Home", "End"]
      if (!nav.includes(e.key)) return
      if ((e.key === "Enter" || e.key === " ") && el?.tagName === "BUTTON") return
      e.preventDefault()
      // Holding a key would flip through the whole film.
      if (e.repeat) return
      const i = indexRef.current
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) goRef.current(i + 1)
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) goRef.current(i - 1)
      else if (e.key === "Home") goRef.current(0)
      else goRef.current(SCENES.length - 1)
      setPlaying(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Autoplay: hold each scene, then move on; a hidden tab pauses it.
  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => {
      if (indexRef.current >= SCENES.length - 1) setPlaying(false)
      else goRef.current(indexRef.current + 1)
    }, holdFor(SCENES[index]))
    const onHide = () => document.hidden && setPlaying(false)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [playing, index])

  // Cycle circumstances until the reader picks one.
  useEffect(() => {
    if (!scene.factors || !cycling) return
    const id = window.setInterval(() => setFactor((f) => Math.min(data.factors.length - 1, f + 1)), CYCLE_MS)
    return () => window.clearInterval(id)
  }, [scene.factors, cycling, data.factors.length])

  const onWheel = (e: React.WheelEvent) => {
    // Pinch-zoom arrives as a wheel event with ctrlKey.
    if (e.ctrlKey || (e.target as HTMLElement).closest("[data-scroll], dialog")) return
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
  const capKey = `${scene.id}:${sex}:${scene.factors ? factor : ""}`
  const openMethods = () => methods.current?.showModal()

  // Controls sit outside the crossfade so they keep focus when the text changes.
  const extra =
    scene.id === "open" ? (
      <Begin onBegin={() => go(1)} playing={playing} onPlay={() => setPlaying((p) => !p)} hint={!compact} />
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
      <Close places={places} follow={follow} onFollow={setFollow} onRestart={() => go(0)} onMethods={openMethods} />
    ) : null

  const caption = (
    <div ref={capRef} tabIndex={-1} className="outline-none">
      <Crossfade id={capKey}>
        <CaptionBody scene={scene} copy={copy} compact={compact} />
      </Crossfade>
      {extra ? (
        <div key={scene.id} className={cn("cap-extra", compact ? "mt-4" : "mt-8")}>
          {extra}
        </div>
      ) : null}
    </div>
  )

  return (
    <div
      className="relative h-dvh w-full select-none overflow-hidden bg-paper"
      onWheel={onWheel}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest("[data-scroll],button,input,a,[role=slider],dialog")) return
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
        clip={lay.clip}
        narrow={lay.narrow}
        onHover={setHover}
        onTime={(t, p) => bar.current?.set(t, p)}
      />

      {scene.time ? (
        <TimeBar
          key={scene.id}
          ref={bar}
          periods={timeOf(scene, data)?.labels ?? data.periods}
          canReplay={(scene.time?.ms ?? 0) > 0}
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

      {hovered && hover ? <Tooltip area={hovered} hover={hover} data={data} sex={sex} scene={scene} factor={factor} W={W} H={H} /> : null}

      {/* One live region for screen readers; the captions themselves aren't live. */}
      <p className="sr-only" aria-live="polite">
        {`${scene.id === "open" ? "" : `${CHAPTERS[chapter]}. `}${copy.title}`}
      </p>

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-3" style={{ height: lay.header, paddingLeft: lay.side, paddingRight: lay.side }}>
        <button type="button" onClick={() => go(0)} className="flex items-center gap-2.5 whitespace-nowrap" aria-label="Ten years apart, back to the start">
          <Mark />
          <span className={cn("display text-[19px] text-ink", lay.narrow && "hidden")}>Ten years apart</span>
        </button>
        <button type="button" onClick={openMethods} className="ml-2 hidden text-[12.5px] text-ink-3 underline decoration-ink/20 underline-offset-4 transition hover:text-ink sm:block">
          Sources
        </button>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {compact ? (
            <button
              type="button"
              aria-label="Follow a place"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((o) => !o)}
              className={cn("flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-white/70", (searchOpen || follow) && "border-ink/40")}
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
      {compact && searchOpen ? (
        <div className="absolute right-4 z-40 w-[min(22rem,calc(100%-2rem))] [animation:menu_180ms_ease-out]" style={{ top: lay.header }}>
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
      {lay.mode === "wide" ? (
        <div className="absolute z-20 flex flex-col justify-center" style={{ left: lay.side, top: lay.header, bottom: lay.rail, width: lay.capW }}>
          {caption}
        </div>
      ) : lay.mode === "side" ? (
        <div data-scroll className="no-scrollbar absolute z-20 overflow-y-auto py-4" style={{ left: lay.side, top: lay.header, bottom: lay.rail, width: lay.capW }}>
          {caption}
        </div>
      ) : (
        <div
          data-scroll
          className="no-scrollbar absolute inset-x-0 z-20 overflow-y-auto border-t border-ink/[0.07] bg-paper/95 backdrop-blur-sm transition-[height] duration-700 ease-[cubic-bezier(0.65,0,0.25,1)]"
          style={{ bottom: lay.rail, height: lay.capH, paddingLeft: lay.side + 4, paddingRight: lay.side + 4 }}
        >
          <div className="pb-5 pt-4">{caption}</div>
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
        W={W}
        chapter={chapter}
      />

      <dialog
        ref={methods}
        className="w-[min(40rem,calc(100%-2rem))] rounded-3xl border border-ink/10 bg-paper p-0 text-ink shadow-[0_40px_80px_-40px_rgba(17,19,21,0.6)] backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && methods.current?.close()}
      >
        <div className="max-h-[80dvh] overflow-y-auto p-7 sm:p-9">
          <div className="flex items-start justify-between gap-6">
            <h2 className="display text-[2rem] leading-none text-ink">Sources and methods</h2>
            <button type="button" onClick={() => methods.current?.close()} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 transition hover:border-ink/40">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="mt-6">
            <Methods data={data} />
          </div>
        </div>
      </dialog>
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
        <div key={gone.id} aria-hidden inert className="cap-out pointer-events-none [grid-area:1/1]">
          {gone.node}
        </div>
      ) : null}
      <div key={id} className={cn("[grid-area:1/1]", gone ? "cap-in cap-wait" : "cap-in")}>
        {children}
      </div>
    </div>
  )
}

function CaptionBody({ scene, copy, compact }: { scene: SceneDef; copy: ReturnType<typeof copyFor>; compact: boolean }) {
  const open = scene.id === "open"
  const head = copy.title.split(" ")
  return (
    <div className="cap">
      {open ? (
        <>
          <p className="kicker">Life expectancy across the UK · 2001–2024</p>
          <h1 className={cn("display text-ink", compact ? "mt-2 text-[2.6rem] leading-[0.92]" : "mt-6 text-[clamp(3.4rem,5.2vw,5.6rem)] leading-[0.9]")}>
            <span className="block whitespace-nowrap">{head.slice(0, -1).join(" ")}</span>
            <span className="mt-[0.06em] flex items-center gap-[0.18em]">
              <Ruler />
              <span>{head.at(-1)}</span>
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
          <h2 className={cn("display text-ink", compact ? "mt-1.5 text-[1.7rem] leading-[1.05]" : "mt-4 text-[clamp(2.1rem,2.9vw,3.1rem)] leading-[1.02]")}>
            {copy.title}
          </h2>
        </>
      )}
      <p className={cn("text-ink-2", compact ? "mt-2.5 text-[15px] leading-[1.55]" : open ? "mt-7 text-[17.5px] leading-[1.6]" : "mt-5 text-[17px] leading-[1.6]")}>
        {copy.body}
      </p>
      {copy.stat ? (
        <div className={cn("border-t-2 border-ink pt-2", compact ? "mt-4" : "mt-7")}>
          <p className={cn("display text-ink", compact ? "text-5xl" : "text-[4.2rem] leading-none")}>{copy.stat.value}</p>
          <p className="mt-1.5 text-[12px] text-ink-3">{copy.stat.label}</p>
        </div>
      ) : null}
      {copy.note ? (
        <p className={cn("border-l-2 border-ink/80 pl-3 text-ink-3", compact ? "mt-3 text-[12.5px] leading-snug" : "mt-6 text-[13.5px] leading-relaxed")}>{copy.note}</p>
      ) : null}
    </div>
  )
}

function Begin({ onBegin, onPlay, playing, hint }: { onBegin: () => void; onPlay: () => void; playing: boolean; hint: boolean }) {
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
      <button type="button" onClick={onPlay} aria-pressed={playing} className="flex items-center gap-2 text-[13.5px] font-medium text-ink-2 transition hover:text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/20">
          {playing ? (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
              <path d="M4 2.5v7M8 2.5v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5" aria-hidden>
              <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
            </svg>
          )}
        </span>
        {playing ? "Playing as a film" : "Play as a film"}
      </button>
      {hint ? <p className="w-full text-[12.5px] text-ink-3">Or scroll, swipe or use the arrow keys.</p> : null}
    </div>
  )
}

/** Radio chips with arrow-key movement and a single tab stop. */
function FactorChips({ factors, value, onChange }: { factors: string[]; value: number; onChange: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Circumstance"
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (!step) return
        e.preventDefault()
        const next = (value + step + factors.length) % factors.length
        onChange(next)
        refs.current[next]?.focus()
      }}
    >
      {factors.map((f, i) => (
        <button
          key={f}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={i === value}
          tabIndex={i === value ? 0 : -1}
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

function Close({
  places,
  follow,
  onFollow,
  onRestart,
  onMethods,
}: {
  places: { code: string; name: string }[]
  follow: string | null
  onFollow: (c: string | null) => void
  onRestart: () => void
  onMethods: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="kicker mb-2">{follow ? "Following" : "Follow your place"}</p>
        <PlaceSearch places={places} value={follow} onChange={onFollow} placeholder="Type a local authority" />
        <p className="mt-2 text-[12.5px] text-ink-3">It stays marked in every scene if you watch again.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] font-medium">
        <button type="button" onClick={onRestart} className="flex items-center gap-2 text-ink transition hover:text-ink-2">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path d="M3 8a5 5 0 1 0 1.46-3.54M3 3v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Watch again
        </button>
        <button type="button" onClick={onMethods} className="text-ink-2 underline decoration-ink/25 underline-offset-4 transition hover:text-ink hover:decoration-ink">
          Sources and methods
        </button>
        <a href={LONG_READ} className="text-ink-2 underline decoration-ink/25 underline-offset-4 transition hover:text-ink hover:decoration-ink">
          Read the long version
        </a>
      </div>
    </div>
  )
}

function Rail({
  index,
  onGo,
  playing,
  onPlay,
  lay,
  W,
  chapter,
}: {
  index: number
  onGo: (i: number) => void
  playing: boolean
  onPlay: () => void
  lay: Layout
  W: number
  chapter: number
}) {
  const hold = holdFor(SCENES[index])
  const groups = CHAPTERS.map((name, ci) => ({ name, ci, scenes: SCENES.map((s, i) => ({ s, i })).filter(({ s }) => s.chapter === ci) }))
  // Every chapter name fits only on very wide screens; otherwise the current chapter is named and the rest numbered.
  const names = W >= 1680
  const segment = (i: number) => (
    <button
      key={i}
      type="button"
      onClick={() => onGo(i)}
      aria-label={`Scene ${i + 1}: ${CHAPTERS[SCENES[i].chapter]}`}
      aria-current={i === index ? "step" : undefined}
      className="group relative flex h-6 min-w-0 flex-1 items-center"
    >
      <span
        className={cn(
          "relative h-[3px] w-full overflow-hidden rounded-full transition-colors duration-500",
          i < index ? "bg-ink/45" : i === index ? "bg-ink/15" : "bg-ink/10 group-hover:bg-ink/25"
        )}
      >
        {i === index ? (
          <span key={`${i}:${playing}`} className="absolute inset-0 origin-left rounded-full bg-ink" style={playing ? { animation: `grow ${hold}ms linear both` } : undefined} />
        ) : null}
      </span>
    </button>
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
      {lay.mode === "wide" ? (
        <ol className="flex min-w-0 flex-1 gap-4">
          {groups.map((g) => (
            // Single-scene chapters still need room for their names.
            <li key={g.name} className="min-w-0" style={{ flex: `${Math.max(g.scenes.length, names || g.ci === chapter ? 2.4 : 1)} 1 0` }}>
              <button
                type="button"
                onClick={() => onGo(g.scenes[0].i)}
                title={g.name}
                className={cn("kicker block max-w-full truncate whitespace-nowrap text-left transition-colors", g.ci === chapter ? "!text-ink" : "!text-ink-3 hover:!text-ink")}
              >
                <span className={names || g.ci === chapter ? "mr-1.5" : ""}>{ROMAN[g.ci]}</span>
                {names || g.ci === chapter ? g.name : null}
              </button>
              <div className="mt-0.5 flex gap-1">{g.scenes.map(({ i }) => segment(i))}</div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex min-w-0 flex-1 gap-[3px]">{SCENES.map((_, i) => segment(i))}</div>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
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

function Tooltip({
  area,
  hover,
  data,
  sex,
  scene,
  factor,
  W,
  H,
}: {
  area: FilmData["areas"][number]
  hover: Hover
  data: FilmData
  sex: Sex
  scene: SceneDef
  factor: number
  W: number
  H: number
}) {
  const now = data.index.now
  const stall = data.index.stall
  const ch = (s: Sex) => (area[s][now] !== null && area[s][stall] !== null ? (area[s][now] as number) - (area[s][stall] as number) : null)
  const f = scene.id === "poverty" ? data.factors[0] : scene.factors ? data.factors[factor] : null
  // Sit clear of the dot and its neighbours: beside it, flipped at the edges.
  const gap = hover.r + 18
  const left = hover.x + gap + 220 > W ? hover.x - gap - 220 : hover.x + gap
  const top = clamp(hover.y - 50, 8, H - 170)
  return (
    <div
      className="pointer-events-none absolute z-40 w-[220px] rounded-2xl border border-ink/10 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(17,19,21,0.5)] backdrop-blur [animation:menu_140ms_ease-out]"
      style={{ left, top }}
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
