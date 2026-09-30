import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/react"
import { siteConfig } from "@/config/site"
import { fontDisplay, fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name}: UK life expectancy by place`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  other: {
    "vercel-toolbar": "disable",
  },
}

export const viewport: Viewport = {
  themeColor: "#f4f4f0",
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth" className={cn(fontSans.variable, fontDisplay.variable)}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
