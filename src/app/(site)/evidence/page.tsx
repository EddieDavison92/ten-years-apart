import type { Metadata } from "next"
import { Suspense } from "react"
import { EvidenceApp } from "@/components/evidence/EvidenceApp"

export const metadata: Metadata = { title: "Evidence" }

export default function EvidencePage() {
  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-ink-3">Loading…</p>}>
      <EvidenceApp />
    </Suspense>
  )
}
