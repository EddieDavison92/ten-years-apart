import Link from "next/link"
import { siteConfig } from "@/config/site"

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid grid-cols-1 max-w-[1440px] gap-8 px-4 py-10 text-sm text-ink-3 sm:px-6 md:grid-cols-[1fr_auto] lg:px-10">
        <div className="max-w-xl space-y-2">
          <p className="display text-lg text-ink">Ten years apart</p>
          <p>
            Life expectancy for every UK local authority. UK data from ONS, OHID and MHCLG under the{" "}
            <a className="link" href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
              Open Government Licence v3.0
            </a>
            . OECD data under CC BY 4.0. Boundaries © Crown copyright. Hex layout © Open Innovations (MIT).
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
          <Link className="hover:text-ink" href="/">Film</Link>
          <Link className="hover:text-ink" href="/story">Long version</Link>
          <Link className="hover:text-ink" href="/explore">Atlas</Link>
          <Link className="hover:text-ink" href="/evidence">Evidence</Link>
          <Link className="hover:text-ink" href="/about">Methods</Link>
          <a className="hover:text-ink" href={siteConfig.github}>GitHub</a>
        </nav>
      </div>
    </footer>
  )
}
