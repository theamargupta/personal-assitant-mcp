'use client'

import { usePathname } from 'next/navigation'
import { AskSathiBar } from '@/components/dashboard/kit'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isChat = pathname === '/dashboard/chat'

  return (
    <div
      className={`mx-auto flex w-full flex-col px-4 pb-10 sm:px-6 lg:px-8 ${
        isChat
          ? 'min-h-0 flex-1 max-w-full gap-0 pt-20 lg:min-h-0 lg:pt-4 lg:pb-4'
          : 'max-w-7xl gap-8 pt-20 lg:pt-8'
      }`}
    >
      {!isChat && (
        <div className="hidden justify-end md:flex">
          <AskSathiBar compact />
        </div>
      )}
      {children}
    </div>
  )
}
