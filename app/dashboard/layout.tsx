import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { AskSathiBar } from '@/components/dashboard/kit'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary">
        <Sidebar />
        <main className="min-h-screen lg:ml-64">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
            <div className="hidden justify-end md:flex">
              <AskSathiBar compact />
            </div>
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
