import type { Metadata, Viewport } from "next"
import { fontDisplay, fontSans } from "@/lib/fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "Ten years apart · the film",
  description: "An animated account of how long people live across the UK's local authorities, how progress stalled after 2011, and who it left behind.",
}

export const viewport: Viewport = {
  themeColor: "#f4f4f0",
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body>{children}</body>
    </html>
  )
}
