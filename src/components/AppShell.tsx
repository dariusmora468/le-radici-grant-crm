'use client'

import AuthGate from '@/components/AuthGate'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="bg-app">
        <Sidebar />
        <main className="ml-56 p-8 relative z-10">
          {children}
        </main>
      </div>
    </AuthGate>
  )
}
