"use client"

import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { Sex } from "@/lib/compute"
import { cn } from "@/lib/cn"

/** Two dots, a gap between them. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 10" className={cn("h-2.5 w-[22px]", className)} aria-hidden>
      <circle cx="4" cy="5" r="4" fill="#b3452c" />
      <circle cx="18" cy="5" r="4" fill="#0b5a4c" />
    </svg>
  )
}

/** Ten-year ruler between the two dots of the mark. */
export function Ruler() {
  return (
    <span aria-hidden className="relative flex h-[0.5em] w-[2.1em] shrink-0 items-center">
      <span className="absolute inset-x-[0.11em] top-1/2 h-[2px] -translate-y-1/2 bg-ink" />
      <span className="absolute inset-x-[0.11em] top-1/2 flex -translate-y-1/2 items-center justify-between">
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className={cn("w-[2px] bg-ink motion-safe:animate-[tick_700ms_cubic-bezier(0.2,0.7,0.2,1)_both]", i % 5 === 0 ? "h-[0.2em]" : "h-[0.1em]")}
            style={{ animationDelay: `${500 + i * 60}ms` }}
          />
        ))}
      </span>
      <span className="absolute left-0 top-1/2 h-[0.22em] w-[0.22em] -translate-y-1/2 rounded-full bg-brick" />
      <span className="absolute right-0 top-1/2 h-[0.22em] w-[0.22em] -translate-y-1/2 rounded-full bg-teal" />
    </span>
  )
}

export function SexToggle({ value, onChange, compact }: { value: Sex; onChange: (s: Sex) => void; compact?: boolean }) {
  const options: { v: Sex; label: string }[] = [
    { v: "male", label: "Men" },
    { v: "female", label: "Women" },
  ]
  return (
    <div role="radiogroup" aria-label="Show figures for" className="relative flex rounded-full border border-ink/10 bg-white/70 p-[3px] backdrop-blur">
      <span
        aria-hidden
        className="absolute inset-y-[3px] w-[calc(50%-3px)] rounded-full bg-ink transition-transform duration-500 ease-[cubic-bezier(0.65,0,0.25,1)]"
        style={{ transform: value === "male" ? "translateX(0)" : "translateX(100%)" }}
      />
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "relative z-10 rounded-full font-medium transition-colors duration-300",
            compact ? "w-[4.2rem] py-1 text-[12.5px]" : "w-[4.9rem] py-1.5 text-[13px]",
            value === o.v ? "text-paper" : "text-ink-2 hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

type Place = { code: string; name: string }

/** Type-ahead for following one place through the film. */
export function PlaceSearch({
  places,
  value,
  onChange,
  compact,
  placeholder = "Follow a place",
  autoFocus,
}: {
  places: Place[]
  value: string | null
  onChange: (code: string | null) => void
  compact?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const chosen = places.find((p) => p.code === value)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const starts = places.filter((p) => p.name.toLowerCase().startsWith(s))
    const has = places.filter((p) => !p.name.toLowerCase().startsWith(s) && p.name.toLowerCase().includes(s))
    return [...starts, ...has].slice(0, 7)
  }, [places, q])

  const pick = (p: Place) => {
    onChange(p.code)
    setQ("")
    setOpen(false)
    input.current?.blur()
  }

  if (chosen)
    return (
      <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 py-1 pl-2 pr-1 backdrop-blur">
        <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 rounded-full border-[1.5px] border-ink" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink" />
        </span>
        <span className={cn("max-w-[11rem] truncate font-medium text-ink", compact ? "text-[12.5px]" : "text-[13px]")}>{chosen.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Stop following ${chosen.name}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    )

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 pl-3 pr-3 backdrop-blur transition focus-within:border-ink/30 focus-within:bg-white">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden>
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          id={id}
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={`${id}-list`}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "ArrowDown") setActive((a) => Math.min(matches.length - 1, a + 1))
            else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1))
            else if (e.key === "Enter" && matches[active]) pick(matches[active])
            else if (e.key === "Escape") {
              setQ("")
              input.current?.blur()
            } else return
            e.preventDefault()
          }}
          className={cn("w-full bg-transparent py-1.5 text-ink outline-none placeholder:text-ink-3", compact ? "w-[8.5rem] text-[12.5px]" : "w-[10.5rem] text-[13px]")}
        />
      </div>
      {open && matches.length ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-white py-1.5 shadow-[0_24px_48px_-24px_rgba(17,19,21,0.45)] [animation:menu_180ms_ease-out]"
        >
          {matches.map((p, i) => (
            <li key={p.code} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={cn("block w-full px-4 py-2 text-left text-[13.5px] text-ink", i === active && "bg-paper-2")}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export type TimeBarHandle = { set: (t: number, playing: boolean) => void }

/** Period scrubber for time scenes, laid under the chart's time axis. */
export const TimeBar = forwardRef<
  TimeBarHandle,
  { periods: string[]; left: number; width: number; top: number; onScrub: (t: number) => void; onReplay: () => void }
>(function TimeBar({ periods, left, width, top, onScrub, onReplay }, ref) {
  const fill = useRef<HTMLDivElement | null>(null)
  const thumb = useRef<HTMLDivElement | null>(null)
  const label = useRef<HTMLSpanElement | null>(null)
  const track = useRef<HTMLDivElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const last = periods.length - 1
  const tRef = useRef(0)

  const paint = (t: number) => {
    const k = Math.max(0, Math.min(1, t / last))
    tRef.current = t
    if (fill.current) fill.current.style.transform = `scaleX(${k})`
    if (thumb.current) thumb.current.style.left = `${k * 100}%`
    if (label.current) label.current.textContent = periods[Math.round(t)]
    track.current?.setAttribute("aria-valuenow", String(Math.round(t)))
    track.current?.setAttribute("aria-valuetext", periods[Math.round(t)])
  }

  useImperativeHandle(ref, () => ({
    set(t, p) {
      paint(t)
      setPlaying((was) => (was === p ? was : p))
    },
  }))

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    const t = Math.max(0, Math.min(last, ((clientX - r.left) / r.width) * last))
    paint(t)
    onScrub(t)
  }

  return (
    <div className="absolute z-20 flex items-center gap-3 [animation:fade_500ms_ease-out_both]" style={{ left: left - 44, top, width: width + 44 }}>
      <button
        type="button"
        onClick={onReplay}
        aria-label={playing ? "Playing" : "Replay through time"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-white/80 text-ink transition hover:border-ink/40"
      >
        {playing ? (
          <span className="flex gap-[3px]" aria-hidden>
            <span className="h-2.5 w-[2.5px] rounded-full bg-ink" />
            <span className="h-2.5 w-[2.5px] rounded-full bg-ink" />
          </span>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path d="M13 8a5 5 0 1 1-1.46-3.54M13 3v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Period"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={0}
        className="group relative h-8 flex-1 cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX)
        }}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
          if (!step) return
          e.preventDefault()
          e.stopPropagation()
          const t = Math.max(0, Math.min(last, Math.round(tRef.current) + step))
          paint(t)
          onScrub(t)
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-ink/10">
          <div ref={fill} className="h-full origin-left bg-ink" style={{ transform: "scaleX(0)" }} />
        </div>
        <div ref={thumb} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: 0 }}>
          <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-ink bg-white shadow-[0_1px_3px_rgba(17,19,21,0.25)] transition-transform group-hover:scale-110" />
          <span ref={label} className="tabular absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-paper" />
        </div>
      </div>
    </div>
  )
})
