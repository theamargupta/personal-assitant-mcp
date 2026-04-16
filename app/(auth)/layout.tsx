import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 relative grain isolate">
      {/* Subtle neon glow */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-neon/[0.03] rounded-full blur-[120px] pointer-events-none" />

      {/* Top neon line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon/15 to-transparent" />

      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mb-10 relative z-10">
        <div className="h-8 w-8 rounded-lg bg-neon flex items-center justify-center">
          <span className="text-[12px] font-bold text-bg-primary leading-none">S</span>
        </div>
        <span className="text-[16px] font-semibold text-text-primary tracking-[-0.01em]">Sathi</span>
      </Link>

      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}
