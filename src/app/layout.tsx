import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Le Radici Grant CRM',
  description: 'Grant discovery, tracking, and application management',
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
