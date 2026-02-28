'use client'

import AuthGate from '@/components/AuthGate'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-cream-50">
        <Sidebar />
        <main className="ml-56 p-8">
          {children}
        </main>
      </div>
    </AuthGate>
  )
}
