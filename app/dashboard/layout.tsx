import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary flex">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
