"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { Engine } from "@/film/engine"
import type { Box } from "@/film/geo"
import { fonts } from "@/film/measure"
import type { Ctx, SceneDef } from "@/film/scenes"
import type { FilmData, Sex } from "@/lib/compute"
import { PAPER } from "@/lib/palette"

export type Hover = { index: number; x: number; y: number; r: number }

export type StageHandle = {
  /** Replays the scene's time from its start. */
  replay: () => void
  /** Moves time to a period index and stops playback. */
  scrub: (t: number) => void
}

type Props = {
  scene: SceneDef
  data: FilmData
  sex: Sex
  follow: string | null
  factor: number
  /** Direction of the last move: forward plays time, back lands on the end state. */
  dir: 1 | -1
  W: number
  H: number
  box: Box
  narrow: boolean
  onHover: (h: Hover | null) => void
  /** Called every frame time moves, with the period index and whether it is still playing. */
  onTime: (t: number, playing: boolean) => void
  onTimeDone: () => void
}

const easeTime = (k: number) => -(Math.cos(Math.PI * k) - 1) / 2

export const Stage = forwardRef<StageHandle, Props>(function Stage(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engine = useRef<Engine | null>(null)
  const time = useRef({ t: 0, from: 0, to: 0, start: 0, ms: 1, delay: 0, playing: false, dirty: false })
  const live = useRef(props)
  const redraw = useRef(true)
  const last = useRef<{ id?: string; sex?: Sex; follow?: string | null; factor?: number; layout?: string; fonts?: number }>({})
  const fontGen = useRef(0)
  const hovered = useRef<number | null>(null)

  useEffect(() => {
    live.current = props
  })

  const ctx = (t: number): Ctx => {
    const p = live.current
    return { data: p.data, sex: p.sex, W: p.W, H: p.H, box: p.box, narrow: p.narrow, t, follow: p.follow, factor: p.factor }
  }

  useImperativeHandle(ref, () => ({
    replay() {
      const s = live.current.scene.time
      if (!s) return
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      Object.assign(time.current, { from: s.from === s.to ? 0 : s.from, to: s.to, t: s.from === s.to ? 0 : s.from, start: performance.now(), ms: Math.max(s.ms, 2500), delay: 250, playing: !reduce, dirty: true })
      if (reduce) time.current.t = s.to
    },
    scrub(t: number) {
      Object.assign(time.current, { t, playing: false, dirty: true })
    },
  }))

  // Engine, fonts and the frame loop live for the component's lifetime.
  useEffect(() => {
    const eng = new Engine()
    engine.current = eng
    eng.paper = PAPER
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    eng.speed = reduce.matches ? 0 : 1
    const readFonts = () => {
      const css = getComputedStyle(document.documentElement)
      const sans = css.getPropertyValue("--font-sans").trim()
      const display = css.getPropertyValue("--font-display").trim()
      if (sans) fonts.sans = `${sans}, system-ui, sans-serif`
      if (display) fonts.display = `${display}, Georgia, serif`
    }
    readFonts()
    document.fonts?.ready.then(() => {
      readFonts()
      fontGen.current += 1
      redraw.current = true
    })

    // Diagonal hatch for years not in good health.
    const tile = document.createElement("canvas")
    tile.width = tile.height = 12
    const tc = tile.getContext("2d")
    if (tc) {
      tc.strokeStyle = "rgba(17,19,21,0.16)"
      tc.lineWidth = 1.4
      for (const o of [-12, 0, 12]) {
        tc.beginPath()
        tc.moveTo(o, 12)
        tc.lineTo(o + 12, 0)
        tc.stroke()
      }
    }

    let raf = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const canvas = canvasRef.current
      const c2d = canvas?.getContext("2d")
      if (!canvas || !c2d) return
      if (!eng.hatch && tc) eng.hatch = c2d.createPattern(tile, "repeat")
      const p = live.current
      const tm = time.current
      let moved = tm.dirty
      if (tm.playing) {
        const raw = (now - tm.start - tm.delay) / tm.ms
        const k = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
        const t = tm.from + (tm.to - tm.from) * easeTime(k)
        if (t !== tm.t) {
          tm.t = t
          moved = true
        }
        if (k >= 1) {
          tm.playing = false
          moved = true
          p.onTimeDone()
        }
      }
      if (moved && p.scene.time) {
        eng.update(p.scene.build(ctx(tm.t)), now)
        p.onTime(tm.t, tm.playing)
      }
      tm.dirty = false
      const busy = eng.step(now)
      if (busy || moved || redraw.current) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const w = Math.round(p.W * dpr)
        const h = Math.round(p.H * dpr)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        eng.draw(c2d, p.W, p.H, dpr)
        redraw.current = false
      }
    }
    raf = requestAnimationFrame(loop)
    const onMotion = () => (eng.speed = reduce.matches ? 0 : 1)
    reduce.addEventListener("change", onMotion)
    return () => {
      cancelAnimationFrame(raf)
      reduce.removeEventListener("change", onMotion)
    }
    // Mount once; live props are read through refs.
  }, [])

  // Scene, settings and layout changes. Values are read from `live` so only these keys retrigger.
  const { W, H, box, sex, follow, factor } = props
  const sceneId = props.scene.id
  const layoutKey = `${W}x${H}:${box.x},${box.y},${box.w},${box.h}`
  useEffect(() => {
    const eng = engine.current
    const p = live.current
    if (!eng || !p.W) return
    const prev = last.current
    const now = performance.now()
    const tm = time.current
    const sceneChanged = prev.id !== sceneId
    const layoutChanged = prev.layout !== layoutKey || prev.fonts !== fontGen.current
    if (sceneChanged && p.scene.time) {
      const s = p.scene.time
      const play = p.dir > 0 && s.ms > 0 && eng.speed > 0
      Object.assign(tm, { from: s.from, to: s.to, t: play ? s.from : s.to, start: now, ms: s.ms || 1, delay: s.delay ?? 0, playing: play })
      p.onTime(tm.t, play)
    }
    // A first paint or a resize jumps; everything else animates.
    const instant = prev.id === undefined || (layoutChanged && !sceneChanged)
    eng.set(p.scene.build(ctx(tm.t)), now, instant)
    redraw.current = true
    last.current = { id: sceneId, sex, follow, factor, layout: layoutKey, fonts: fontGen.current }
  }, [sceneId, sex, follow, factor, layoutKey])

  // Rebuild once webfonts arrive, since label widths depend on them.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (last.current.fonts !== fontGen.current && engine.current) {
        engine.current.set(live.current.scene.build(ctx(time.current.t)), performance.now(), true)
        last.current.fonts = fontGen.current
        redraw.current = true
        window.clearInterval(id)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const hit = (e: React.PointerEvent) => {
    const eng = engine.current
    if (!eng) return
    const rect = e.currentTarget.getBoundingClientRect()
    const h = eng.hit(e.clientX - rect.left, e.clientY - rect.top)
    if ((h?.index ?? null) !== hovered.current) {
      hovered.current = h?.index ?? null
      props.onHover(h)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={props.scene.aria({ data: props.data, sex: props.sex, W: props.W, H: props.H, box: props.box, narrow: props.narrow, t: 0, follow: props.follow, factor: props.factor })}
      className="absolute inset-0 h-full w-full touch-pan-y"
      style={{ width: props.W, height: props.H }}
      onPointerMove={hit}
      onPointerDown={hit}
      onPointerLeave={() => {
        hovered.current = null
        props.onHover(null)
      }}
    />
  )
})
