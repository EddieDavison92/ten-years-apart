"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import * as d3 from "d3"
import { useSize } from "@/components/story/use-size"
import { formatYears } from "@/lib/explorer/format"
import { dodge } from "@/lib/story/layout"
import { FEMALE, INK, INK_3, LINE, MALE } from "@/lib/story/palette"

const PAD = 12

/** Every local authority as a dot on one axis, this one ringed. */
export function RankStrip({
  sex,
  distribution,
  code,
  names,
  domain,
}: {
  sex: "male" | "female"
  distribution: [string, number][]
  code: string
  names: Record<string, string>
  domain: [number, number]
}) {
  const [ref, { width }] = useSize<HTMLDivElement>({ width: 600, height: 120 })
  const [hover, setHover] = useState<number | null>(null)
  const router = useRouter()
  const colour = sex === "male" ? MALE : FEMALE
  const x = useMemo(() => d3.scaleLinear().domain(domain).range([PAD, width - PAD]), [domain, width])
  const H = width < 500 ? 150 : 120
  // Dots shrink, down to 1.6px, until every one has its own slot.
  const { r, pos } = useMemo(() => {
    const xs = distribution.map(([, v]) => x(v))
    let r = Math.max(2.2, Math.min(4, width / 180))
    for (;;) {
      const info = { crowded: 0 }
      const pos = dodge(xs, r, H / 2 - 6, H / 2 - 14, info)
      if (info.crowded === 0 || r <= 1.6) return { r, pos }
      r = Math.max(1.6, r * 0.9)
    }
  }, [distribution, x, width, H])
  const self = distribution.findIndex(([c]) => c === code)
  const selfPos = pos[self]

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={H} className="chart block" role="img" aria-label={`${distribution.length} areas by ${sex} life expectancy`}>
        {x.ticks(6).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={8} y2={H - 22} stroke={LINE} opacity={0.6} />
            <text y={H - 6} textAnchor="middle" fontSize={10} fill={INK_3}>
              {t}
            </text>
          </g>
        ))}
        {distribution.map(([c], i) => {
          const p = pos[i]
          if (!p || i === self) return null
          return (
            <circle
              key={c}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={colour}
              fillOpacity={hover === i ? 0.9 : 0.28}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onClick={() => router.push(`/area/${c}`)}
              className="cursor-pointer"
            />
          )
        })}
        {selfPos ? (
          <g>
            <circle cx={selfPos.x} cy={selfPos.y} r={r + 3} fill={colour} stroke={INK} strokeWidth={1.5} />
          </g>
        ) : null}
      </svg>
      {hover !== null && pos[hover] ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-white px-2 py-1 text-xs shadow-md"
          style={{ left: Math.max(70, Math.min(width - 70, pos[hover]!.x)), top: pos[hover]!.y - 8 }}
        >
          {names[distribution[hover][0]] ?? distribution[hover][0]}{" "}
          <span className="tabular text-ink-3">{formatYears(distribution[hover][1])}</span>
        </div>
      ) : null}
    </div>
  )
}
