import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PA MCP — Personal Assistant',
  description: 'Devfrend Personal Assistant MCP Server',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
