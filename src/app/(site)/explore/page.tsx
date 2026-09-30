import type { Metadata } from "next"
import { Suspense } from "react"
import { ExplorerApp } from "@/components/explorer/ExplorerApp"

export const metadata: Metadata = { title: "Map" }

export default function ExplorePage() {
  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-ink-3">Loading…</p>}>
      <ExplorerApp />
    </Suspense>
  )
}
