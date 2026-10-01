"use client"

import { useState } from "react"
import * as d3 from "d3"
import { useSize } from "@/components/story/use-size"
import { useTween } from "@/components/story/use-tween"
import { INK, INK_3, LINE, PAPER } from "@/lib/story/palette"

export const LOW = "#b3452c"
export const HIGH = "#0b5a4c"
const EASE = "cubic-bezier(0.65,0,0.25,1)"
const short = (p: string) => p.replace(/^(\d{4}) to \d{2}(\d{2})$/, "$1–$2")

type Series = { label: string; values: (number | null)[]; colour: string; reference?: boolean }

/** Two places and a reference over time. Draws when active; optionally brackets the gap at the first and last period. */
export function PairLines({
  periods,
  lines: target,
  title,
  digits = 1,
  bracket = false,
  active,
}: {
  periods: string[]
  /** Low place, high place, reference. */
  lines: [Series, Series, Series]
  title: string
  digits?: number
  bracket?: boolean
  active: boolean
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const narrow = width < 560
  const M = { top: 56, right: narrow ? 64 : 132, bottom: 48, left: 44 }
  const w = Math.max(10, width - M.left - M.right)
  const h = Math.max(10, height - M.top - M.bottom)
  const last = periods.length - 1
  const x = d3.scaleLinear().domain([0, last]).range([0, w])
  const all = target.flatMap((l) => l.values).filter((v): v is number => v !== null)
  const domain = d3.scaleLinear().domain(d3.extent(all) as [number, number]).nice().domain()
  // Lines and axis glide together when the series change; NaN stands in for a missing value.
  const n = periods.length
  const tweened = useTween([...domain, ...target.flatMap((l) => l.values.map((v) => v ?? NaN))], 900)
  const lines = target.map((l, k) => ({
    ...l,
    values: tweened.slice(2 + k * n, 2 + (k + 1) * n).map((v) => (Number.isFinite(v) ? v : null)),
  })) as [Series, Series, Series]
  const y = d3.scaleLinear().domain([tweened[0], tweened[1]]).range([h, 0])
  const path = d3
    .line<number | null>()
    .defined((v) => v !== null)
    .x((_, i) => x(i))
    .y((v) => y(v as number))
    .curve(d3.curveMonotoneX)
  const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(digits))

  // End labels, nudged apart so they never overlap.
  const ends = lines
    .map((l, k) => ({ k, y: y(l.values[last] ?? 0) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i += 1) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 16)
  const endY = new Map(ends.map((e) => [e.k, e.y]))
  const [low, high] = lines

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg
        width={width}
        height={height}
        className="chart"
        role="img"
        aria-label={title}
        onPointerMove={(e) => {
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left - M.left
          setHover(Math.max(0, Math.min(last, Math.round(x.invert(px)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <g transform={`translate(${M.left},${M.top})`}>
          <text x={-M.left} y={-32} fontSize={10.5} fill={INK_3}>
            {title}
          </text>
          {y.ticks(6).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={w} stroke={LINE} opacity={0.8} />
              <text x={-10} dy="0.32em" textAnchor="end" fontSize={10.5} fill={INK_3}>
                {t}
              </text>
            </g>
          ))}
          {[0, Math.round(last / 2), last].map((i) => (
            <text key={i} x={x(i)} y={h + 24} textAnchor="middle" fontSize={10.5} fill={INK_3}>
              {short(periods[i])}
            </text>
          ))}
          {bracket ? (
            <path
              d={
                d3
                  .area<number>()
                  .defined((i) => low.values[i] !== null && high.values[i] !== null)
                  .x((i) => x(i))
                  .y0((i) => y(low.values[i] as number))
                  .y1((i) => y(high.values[i] as number))
                  .curve(d3.curveMonotoneX)(d3.range(periods.length)) ?? ""
              }
              fill={INK}
              style={{ opacity: active ? 0.045 : 0, transition: `opacity 700ms ${active ? 900 : 0}ms` }}
            />
          ) : null}
          {lines.map((l, k) => (
            <path
              key={k}
              d={path(l.values) ?? ""}
              fill="none"
              stroke={l.colour}
              strokeWidth={l.reference ? 1.5 : 2.75}
              strokeDasharray={l.reference ? undefined : "1 1"}
              pathLength={l.reference ? undefined : 1}
              style={
                l.reference
                  ? { opacity: active ? 0.55 : 0, transition: "opacity 600ms" }
                  : { strokeDashoffset: active ? 0 : 1, transition: `stroke-dashoffset 1400ms ${EASE} ${active ? k * 120 : 0}ms` }
              }
            />
          ))}
          <g style={{ opacity: active ? 1 : 0, transition: `opacity 500ms ${active ? 1100 : 0}ms` }}>
            {lines.map((l, k) => (
              <g key={k}>
                <circle cx={x(last)} cy={y(l.values[last] ?? 0)} r={l.reference ? 2.5 : 4} fill={l.colour} stroke={PAPER} strokeWidth={1.5} />
                <text x={w + 10} y={endY.get(k)} dy="0.32em" fontSize={11.5} fontWeight={l.reference ? 400 : 600} fill={l.reference ? INK_3 : l.colour}>
                  {narrow ? null : `${l.label} `}
                  <tspan fontWeight={400} fill={l.reference ? INK_3 : INK}>
                    {fmt(l.values[last])}
                  </tspan>
                </text>
              </g>
            ))}
            {bracket
              ? [0, last].map((i) => {
                  const top = y(high.values[i] as number)
                  const bottom = y(low.values[i] as number)
                  const bx = i === 0 ? x(i) + 10 : x(i) - 10
                  // Centre the label in the wider half either side of the reference line, clear of it.
                  const refY = Math.max(top, Math.min(bottom, y(lines[2].values[i] ?? 0)))
                  const ly = refY - top > bottom - refY ? (top + refY) / 2 : (refY + bottom) / 2
                  return (
                    <g key={i}>
                      <line x1={bx} x2={bx} y1={top + 6} y2={bottom - 6} stroke={INK} strokeWidth={1.25} />
                      <line x1={bx - 4} x2={bx + 4} y1={top + 6} y2={top + 6} stroke={INK} strokeWidth={1.25} />
                      <line x1={bx - 4} x2={bx + 4} y1={bottom - 6} y2={bottom - 6} stroke={INK} strokeWidth={1.25} />
                      <text
                        x={i === 0 ? bx + 8 : bx - 8}
                        y={ly}
                        dy="-0.2em"
                        textAnchor={i === 0 ? "start" : "end"}
                        fontSize={12}
                        fontWeight={700}
                        fill={INK}
                        stroke={PAPER}
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {((high.values[i] ?? 0) - (low.values[i] ?? 0)).toFixed(1)} yrs
                        <tspan x={i === 0 ? bx + 8 : bx - 8} dy="1.3em" fontSize={10.5} fontWeight={400} fill={INK_3}>
                          {i === 0 ? "gap" : "gap now"}
                        </tspan>
                      </text>
                    </g>
                  )
                })
              : null}
          </g>
          {hover !== null && active ? (
            <g className="pointer-events-none">
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke={INK} opacity={0.25} />
              {lines.map((l, k) =>
                l.values[hover] === null ? null : (
                  <circle key={k} cx={x(hover)} cy={y(l.values[hover] as number)} r={3.5} fill={l.colour} stroke={PAPER} strokeWidth={1.5} />
                )
              )}
            </g>
          ) : null}
        </g>
      </svg>
      {hover !== null && active ? (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-xl border border-line bg-white px-3 py-2 shadow-[0_16px_40px_-20px_rgba(17,19,21,0.5)]"
          style={{ left: Math.min(width - 184, M.left + x(hover) + 14), top: M.top }}
        >
          <p className="mono text-[11px] font-semibold text-ink">{short(periods[hover])}</p>
          <ol className="mono mt-1 space-y-px text-[10.5px]">
            {lines.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5 text-ink-2">
                <span className="h-1.5 w-2.5 rounded-sm" style={{ background: l.colour }} />
                <span className="truncate">{l.label}</span>
                <span className="ml-auto text-ink">{fmt(l.values[hover])}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
