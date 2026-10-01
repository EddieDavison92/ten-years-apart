"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Story", icon: StoryIcon },
  { href: "/explore", label: "Atlas", icon: AtlasIcon },
  { href: "/evidence", label: "Evidence", icon: EvidenceIcon },
  { href: "/about", label: "Methods", icon: MethodsIcon },
]

function useActive() {
  const pathname = usePathname()
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
}

export function SiteHeader() {
  const active = useActive()
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-baseline gap-2 whitespace-nowrap">
            <Mark />
            <span className="display text-[19px] font-normal text-ink">Ten years apart</span>
          </Link>
          {/* Page controls, e.g. the story's men/women switch, are portalled here. */}
          <div id="header-tools" className="ml-auto flex items-center" />
          <nav className="hidden items-center text-sm sm:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 transition-colors",
                  active(item.href) ? "text-ink" : "text-ink-3 hover:text-ink"
                )}
              >
                {item.label}
                {active(item.href) ? <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-ink" /> : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <MobileNav />
    </>
  )
}

/** App-style tab bar for phones. */
function MobileNav() {
  const active = useActive()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = active(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  on ? "font-semibold text-ink" : "text-ink-3"
                )}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", on && "bg-ink/[0.06]")}>
                  <Icon on={on} />
                </span>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Two dots, a gap between them. */
function Mark() {
  return (
    <svg viewBox="0 0 22 10" className="h-2.5 w-[22px] translate-y-[-1px]" aria-hidden>
      <circle cx="4" cy="5" r="4" fill="#b3452c" />
      <circle cx="18" cy="5" r="4" fill="#0b5a4c" />
    </svg>
  )
}

type IconProps = { on: boolean }

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

/** The mark: two places, ten years apart. */
function StoryIcon({ on }: IconProps) {
  return (
    <svg {...base}>
      <path d="M7 12h10M9.5 10.6v2.8M12 10v4M14.5 10.6v2.8" />
      <circle cx="4.5" cy="12" r="2.5" fill={on ? "#b3452c" : "none"} stroke={on ? "#b3452c" : "currentColor"} />
      <circle cx="19.5" cy="12" r="2.5" fill={on ? "#0b5a4c" : "none"} stroke={on ? "#0b5a4c" : "currentColor"} />
    </svg>
  )
}

/** Honeycomb, like the story's hex map. */
function AtlasIcon({ on }: IconProps) {
  return (
    <svg {...base}>
      <g transform="translate(0 0.7)">
        <path d="M12 6.1v4.2l-3.64 2.1-3.63-2.1V6.1l3.63-2.1z" fill={on ? "#b3452c" : "none"} />
        <path d="M19.27 6.1v4.2l-3.63 2.1-3.64-2.1V6.1l3.64-2.1z" fill={on ? "#0b5a4c" : "none"} />
        <path d="M15.64 12.4v4.2L12 18.7l-3.64-2.1v-4.2l3.64-2.1z" fill={on ? "#6fb6a1" : "none"} />
      </g>
    </svg>
  )
}

/** Scatter with its fitted line. */
function EvidenceIcon({ on }: IconProps) {
  return (
    <svg {...base}>
      <path d="M4 4v16h16" />
      <path d="m6.5 7.5 12 9.5" strokeWidth={on ? 2 : 1.5} />
      {[
        [8, 6.5],
        [9.5, 10.5],
        [13, 11],
        [15, 15.5],
        [18, 14.5],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={1.35} fill="currentColor" stroke="none" />
      ))}
    </svg>
  )
}

/** A folded note. */
function MethodsIcon({ on }: IconProps) {
  return (
    <svg {...base}>
      <path d="M6 3.5h8.5L18.5 7.5v13H6z" fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.08 : 0} />
      <path d="M14.5 3.5v4h4" />
      <path d="M9 11.5h6.5M9 14.5h6.5M9 17.5h4" />
    </svg>
  )
}
