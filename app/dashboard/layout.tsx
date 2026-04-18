import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { DashboardMain } from '@/components/dashboard/DashboardMain'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-bg-primary">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col lg:ml-64">
          <DashboardMain>{children}</DashboardMain>
        </main>
      </div>
    </AuthGuard>
  )
}
