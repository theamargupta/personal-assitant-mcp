import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sathi — Personal Assistant',
  description: 'Track habits, manage tasks, store documents, monitor spending, set goals — and ask Claude anything about your life.',
  openGraph: {
    title: 'Sathi — Personal Assistant',
    description: 'One companion to rule them all. Habits, Tasks, Documents, Finance, Goals — powered by Claude.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="bg-bg-primary text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
