import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col items-start justify-center gap-4 px-6 py-32">
      <p className="kicker">404</p>
      <h1 className="display text-6xl text-ink">Nothing lives here</h1>
      <p className="text-lg text-ink-2">That page doesn&apos;t exist. The story, the atlas and every area report do.</p>
      <div className="flex gap-3 text-sm">
        <Link href="/" className="rounded-full bg-ink px-5 py-2.5 text-paper hover:bg-ink/85">
          Watch the film
        </Link>
        <Link href="/explore" className="rounded-full border border-line px-5 py-2.5 text-ink hover:border-ink/30">
          Open the atlas
        </Link>
      </div>
    </div>
  )
}
