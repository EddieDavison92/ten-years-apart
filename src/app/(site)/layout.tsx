import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <SiteHeader />
      <main className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-1 flex-col px-4 sm:px-6 lg:px-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
